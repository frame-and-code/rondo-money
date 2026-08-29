import { Inject, Injectable } from '@nestjs/common';
import { type CategoryGroup, type Prisma } from '@rondo/db';

import { availableOf, lockCategories, refuseWhatStillHoldsMoney } from '@/categories/available';
import {
  CreateCategoryGroupDto,
  ReorderCategoryGroupsDto,
  UpdateCategoryGroupDto,
} from '@/categories/categories.dto';
import { NO_ACTIVE_BUDGET, refuse } from '@/categories/category-refusal';
import { CategoryGroupResponse } from '@/categories/category.response';
import { byId, inWriteOrder, wholeOrder } from '@/categories/write-order';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

function serialize(group: CategoryGroup): Prisma.JsonObject {
  return {
    id: group.id,
    name: group.name,
    sortOrder: group.sortOrder,
    hidden: group.hiddenAt !== null,
  };
}

function decode(stored: Prisma.JsonValue): CategoryGroupResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored category group is not an object: ${JSON.stringify(stored)}`);
  }

  const { id, name, sortOrder, hidden } = stored;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof sortOrder !== 'number' ||
    typeof hidden !== 'boolean'
  ) {
    throw new Error(`A stored category group is missing fields: ${JSON.stringify(stored)}`);
  }

  return { id, name, sortOrder, hidden };
}

@Injectable()
export class CategoryGroupsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  async create(userId: string, body: CreateCategoryGroupDto): Promise<CategoryGroupResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key: body.idempotencyKey, request: { budgetId: intended.id, name: body.name }, decode },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);

        return serialize(
          await tx.categoryGroup.create({
            data: {
              userId,
              budgetId: budget.id,
              name: body.name,
              sortOrder: await tx.categoryGroup.count({ where: {} }),
            },
          }),
        );
      },
    );
  }

  async update(id: string, body: UpdateCategoryGroupDto): Promise<CategoryGroupResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, id, name: body.name },
        decode,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        const current = await this.knownGroup(tx, id);

        return serialize(
          await tx.categoryGroup.update({ where: { id: current.id }, data: { name: body.name } }),
        );
      },
    );
  }

  async hide(id: string, key: string): Promise<CategoryGroupResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key, request: { budgetId: intended.id, id, act: 'hide' }, decode },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const group = await this.knownGroup(tx, id);

        if (group.hiddenAt !== null) {
          throw refuse(
            'ALREADY_HIDDEN',
            `Category group ${id} is already hidden. Hiding it again would move its marker ` +
              'away from the one its categories carry, and they would have no way back.',
          );
        }

        const inside = await tx.category.findMany({ where: { groupId: id } });
        const ids = inside.map((one) => one.id).sort(byId);

        const locked = await lockCategories(this.raw, tx, budget.id, ids);
        refuseWhatStillHoldsMoney(
          await availableOf(this.raw, tx, budget.id, ids),
          'A category of this group',
        );

        const hiddenAt = new Date();
        const standing = locked
          .filter((one) => one.hiddenAt === null)
          .map((one) => one.id)
          .sort(byId);

        for (const categoryId of standing) {
          await tx.category.update({ where: { id: categoryId }, data: { hiddenAt } });
        }

        return serialize(await tx.categoryGroup.update({ where: { id }, data: { hiddenAt } }));
      },
    );
  }

  async unhide(id: string, key: string): Promise<CategoryGroupResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key, request: { budgetId: intended.id, id, act: 'unhide' }, decode },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        const group = await this.knownGroup(tx, id);

        const inside = await tx.category.findMany({ where: { groupId: id } });
        const withTheGroup = inside
          .filter((one) => one.hiddenAt?.getTime() === group.hiddenAt?.getTime())
          .map((one) => one.id)
          .sort(byId);

        for (const categoryId of withTheGroup) {
          await tx.category.update({ where: { id: categoryId }, data: { hiddenAt: null } });
        }

        return serialize(
          await tx.categoryGroup.update({ where: { id }, data: { hiddenAt: null } }),
        );
      },
    );
  }

  async reorder(body: ReorderCategoryGroupsDto): Promise<CategoryGroupResponse[]> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, groupIds: [...body.groupIds] },
        decode: (stored) => {
          if (!Array.isArray(stored)) {
            throw new Error(`A stored reordering is not a list: ${JSON.stringify(stored)}`);
          }

          return stored.map(decode);
        },
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);

        const held = await tx.categoryGroup.findMany({ where: {} });
        const known = new Set(held.map((one) => one.id));
        const usable =
          new Set(body.groupIds).size === body.groupIds.length &&
          body.groupIds.every((id) => known.has(id));

        if (!usable) {
          throw refuse(
            'UNKNOWN_GROUP',
            'A reordering names a group twice, or one this budget does not hold. It may name ' +
              'fewer than the budget holds: the month a drop came from lists only what is ' +
              'visible in it, and the rest keep their order behind the named ones.',
          );
        }

        const order = wholeOrder(body.groupIds, held);
        const written = new Map<string, Prisma.JsonObject>();

        for (const row of inWriteOrder(order)) {
          written.set(
            row.id,
            serialize(
              await tx.categoryGroup.update({
                where: { id: row.id },
                data: { sortOrder: row.sortOrder },
              }),
            ),
          );
        }

        return order.flatMap((id) => {
          const one = written.get(id);

          return one ? [one] : [];
        });
      },
    );
  }

  private async knownGroup(tx: MutationClient, id: string): Promise<CategoryGroup> {
    const found = await tx.categoryGroup.findFirst({ where: { id } });
    if (!found) {
      throw refuse('UNKNOWN_GROUP', `This budget holds no category group ${id}.`);
    }

    return found;
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuse('NO_ACTIVE_BUDGET', NO_ACTIVE_BUDGET);
    }

    return budget;
  }
}
