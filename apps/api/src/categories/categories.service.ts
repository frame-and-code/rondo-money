import { Inject, Injectable } from '@nestjs/common';
import { type Category, type Prisma } from '@rondo/db';
import { isCategoryColor, isCategoryIcon } from '@rondo/types';

import { availableOf, lockCategories, refuseWhatStillHoldsMoney } from '@/categories/available';
import {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from '@/categories/categories.dto';
import { NO_ACTIVE_BUDGET, refuse } from '@/categories/category-refusal';
import { CategoryResponse } from '@/categories/category.response';
import { inWriteOrder, wholeOrder } from '@/categories/write-order';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

function serialize(category: Category): Prisma.JsonObject {
  return {
    id: category.id,
    groupId: category.groupId,
    name: category.name,
    sortOrder: category.sortOrder,
    icon: category.icon,
    color: category.color,
    hidden: category.hiddenAt !== null,
  };
}

function decode(stored: Prisma.JsonValue): CategoryResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored category is not an object: ${JSON.stringify(stored)}`);
  }

  const { id, groupId, name, sortOrder, icon, color, hidden } = stored;
  if (
    typeof id !== 'string' ||
    typeof groupId !== 'string' ||
    typeof name !== 'string' ||
    typeof sortOrder !== 'number' ||
    typeof hidden !== 'boolean'
  ) {
    throw new Error(`A stored category is missing fields: ${JSON.stringify(stored)}`);
  }

  return {
    id,
    groupId,
    name,
    sortOrder,
    icon: isCategoryIcon(icon) ? icon : null,
    color: isCategoryColor(color) ? color : null,
    hidden,
  };
}

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  async create(userId: string, body: CreateCategoryDto): Promise<CategoryResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          groupId: body.groupId,
          name: body.name,
          icon: body.icon ?? null,
          color: body.color ?? null,
        },
        decode,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        await this.openGroup(tx, body.groupId);

        const written = await tx.category.create({
          data: {
            userId,
            budgetId: budget.id,
            groupId: body.groupId,
            name: body.name,
            sortOrder: await tx.category.count({ where: { groupId: body.groupId } }),
            icon: body.icon ?? null,
            color: body.color ?? null,
          },
        });

        return serialize(written);
      },
    );
  }

  async update(userId: string, id: string, body: UpdateCategoryDto): Promise<CategoryResponse> {
    void userId;
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          id,
          groupId: body.groupId ?? null,
          name: body.name ?? null,
          icon: body.icon ?? null,
          color: body.color ?? null,
        },
        decode,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        const current = await this.knownCategory(tx, id);

        const moving = body.groupId !== undefined && body.groupId !== current.groupId;
        if (moving && body.groupId !== undefined) {
          await this.openGroup(tx, body.groupId);
        }

        const written = await tx.category.update({
          where: { id: current.id },
          data: {
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.icon === undefined ? {} : { icon: body.icon }),
            ...(body.color === undefined ? {} : { color: body.color }),
            ...(moving && body.groupId !== undefined
              ? {
                  groupId: body.groupId,
                  sortOrder: await tx.category.count({ where: { groupId: body.groupId } }),
                }
              : {}),
          },
        });

        return serialize(written);
      },
    );
  }

  async hide(userId: string, id: string, key: string): Promise<CategoryResponse> {
    void userId;
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key, request: { budgetId: intended.id, id, act: 'hide' }, decode },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        const locked = await lockCategories(this.raw, tx, budget.id, [id]);
        const [held] = locked;
        if (!held) {
          throw refuse('UNKNOWN_CATEGORY', `This budget holds no category ${id}.`);
        }

        if (held.hiddenAt !== null) {
          throw refuse(
            'ALREADY_HIDDEN',
            `Category ${id} is already hidden. Hiding it again would move the marker that ` +
              'decides which months stopped showing it, and put it back into months it had left.',
          );
        }

        refuseWhatStillHoldsMoney(
          await availableOf(this.raw, tx, budget.id, [id]),
          'This category',
        );

        return serialize(
          await tx.category.update({ where: { id }, data: { hiddenAt: new Date() } }),
        );
      },
    );
  }

  async unhide(userId: string, id: string, key: string): Promise<CategoryResponse> {
    void userId;
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      { key, request: { budgetId: intended.id, id, act: 'unhide' }, decode },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        const current = await this.knownCategory(tx, id);

        return serialize(
          await tx.category.update({ where: { id: current.id }, data: { hiddenAt: null } }),
        );
      },
    );
  }

  async reorder(userId: string, body: ReorderCategoriesDto): Promise<CategoryResponse[]> {
    void userId;
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: {
          budgetId: intended.id,
          groupId: body.groupId,
          categoryIds: [...body.categoryIds],
        },
        decode: (stored) => {
          if (!Array.isArray(stored)) {
            throw new Error(`A stored reordering is not a list: ${JSON.stringify(stored)}`);
          }

          return stored.map(decode);
        },
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);
        await this.knownGroup(tx, body.groupId);

        const held = await tx.category.findMany({ where: { groupId: body.groupId } });
        this.refuseAnythingButASubset(held, body.categoryIds);

        const order = wholeOrder(body.categoryIds, held);
        const written = new Map<string, Prisma.JsonObject>();

        for (const row of inWriteOrder(order)) {
          written.set(
            row.id,
            serialize(
              await tx.category.update({
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

  private refuseAnythingButASubset(held: { id: string }[], asked: string[]): void {
    const known = new Set(held.map((one) => one.id));
    const usable = new Set(asked).size === asked.length && asked.every((id) => known.has(id));

    if (!usable) {
      throw refuse(
        'UNKNOWN_CATEGORY',
        'A reordering names a category twice, or one this group does not hold. It may name ' +
          'fewer than the group holds: the month a drop came from lists only what is visible ' +
          'in it, and the rest keep their order behind the named ones.',
      );
    }
  }

  private async knownCategory(tx: MutationClient, id: string): Promise<Category> {
    const found = await tx.category.findFirst({ where: { id } });
    if (!found) {
      throw refuse('UNKNOWN_CATEGORY', `This budget holds no category ${id}.`);
    }

    return found;
  }

  private async knownGroup(tx: MutationClient, id: string): Promise<{ hiddenAt: Date | null }> {
    const found = await tx.categoryGroup.findFirst({ where: { id } });
    if (!found) {
      throw refuse('UNKNOWN_GROUP', `This budget holds no category group ${id}.`);
    }

    return found;
  }

  private async openGroup(tx: MutationClient, id: string): Promise<void> {
    const group = await this.knownGroup(tx, id);
    if (group.hiddenAt !== null) {
      throw refuse(
        'GROUP_HIDDEN',
        `Category group ${id} is hidden, and a category put inside it would leave the screen ` +
          'carrying whatever it holds.',
      );
    }
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
