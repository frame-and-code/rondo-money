import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@rondo/db';
import {
  calendarDateOf,
  parseCalendarDate,
  parseMoney,
  serializeMoney,
  toDbDate,
  todayIn,
  type NetWorthRefusal,
} from '@rondo/types';

import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { DeleteNetWorthItemDto } from '@/net-worth/delete-net-worth-item.dto';
import { NetWorthItemResponse, NetWorthItemsResponse } from '@/net-worth/net-worth-item.response';
import { refuseNetWorth } from '@/net-worth/net-worth-refusal';
import { refuseValuation } from '@/net-worth/valuation-date';
import { WriteNetWorthItemDto } from '@/net-worth/write-net-worth-item.dto';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';

export type NetWorthKind = 'asset' | 'liability';

interface StoredItem {
  id: string;
  name: string;
  amount: bigint;
  date: Date | null;
}

interface ItemValues {
  name: string;
  amount: bigint;
  date: Date | null;
}

interface ItemOwner {
  userId: string;
  budgetId: string;
}

interface ItemTable {
  unknown: NetWorthRefusal;
  list(client: ScopedPrismaClient): Promise<StoredItem[]>;
  find(client: MutationClient, id: string): Promise<StoredItem | null>;
  create(client: MutationClient, owner: ItemOwner, values: ItemValues): Promise<StoredItem>;
  update(client: MutationClient, id: string, values: ItemValues): Promise<StoredItem[]>;
  remove(client: MutationClient, id: string): Promise<{ count: number }>;
}

const OLDEST_FIRST = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

const TABLES: Record<NetWorthKind, ItemTable> = {
  asset: {
    unknown: 'UNKNOWN_ASSET',
    list: (client) => client.asset.findMany({ orderBy: [...OLDEST_FIRST] }),
    find: (client, id) => client.asset.findFirst({ where: { id } }),
    create: (client, owner, values) => client.asset.create({ data: { ...owner, ...values } }),
    update: (client, id, values) =>
      client.asset.updateManyAndReturn({ where: { id }, data: values }),
    remove: (client, id) => client.asset.deleteMany({ where: { id } }),
  },
  liability: {
    unknown: 'UNKNOWN_LIABILITY',
    list: (client) => client.liability.findMany({ orderBy: [...OLDEST_FIRST] }),
    find: (client, id) => client.liability.findFirst({ where: { id } }),
    create: (client, owner, values) => client.liability.create({ data: { ...owner, ...values } }),
    update: (client, id, values) =>
      client.liability.updateManyAndReturn({ where: { id }, data: values }),
    remove: (client, id) => client.liability.deleteMany({ where: { id } }),
  },
};

function serialize(item: StoredItem): NetWorthItemResponse {
  return {
    id: item.id,
    name: item.name,
    amount: serializeMoney(item.amount),
    date: item.date === null ? null : calendarDateOf(item.date),
  };
}

function stored(item: StoredItem): Prisma.JsonObject {
  return { ...serialize(item) };
}

function decodeItem(held: Prisma.JsonValue): NetWorthItemResponse {
  if (typeof held !== 'object' || held === null || Array.isArray(held)) {
    throw new Error(`A stored asset or liability is not an object: ${JSON.stringify(held)}`);
  }

  const { id, name, amount, date } = held;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof amount !== 'string' ||
    (date !== null && typeof date !== 'string')
  ) {
    throw new Error(`A stored asset or liability is missing fields: ${JSON.stringify(held)}`);
  }

  return {
    id,
    name,
    amount: serializeMoney(parseMoney(amount)),
    date: date === null ? null : parseCalendarDate(date),
  };
}

function valuesOf(body: WriteNetWorthItemDto): ItemValues {
  return {
    name: body.name,
    amount: parseMoney(body.amount),
    date: body.date === undefined ? null : toDbDate(body.date),
  };
}

@Injectable()
export class NetWorthItemsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
  ) {}

  async list(kind: NetWorthKind): Promise<NetWorthItemsResponse> {
    await this.activeBudget(this.prisma);

    const items = await TABLES[kind].list(this.prisma);

    return { items: items.map(serialize) };
  }

  async create(
    kind: NetWorthKind,
    userId: string,
    body: WriteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    const intended = await this.activeBudget(this.prisma);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, kind, act: 'create', ...this.intentOf(body) },
        decode: decodeItem,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        this.checkDay(body, budget.timezone);

        return stored(
          await TABLES[kind].create(tx, { userId, budgetId: budget.id }, valuesOf(body)),
        );
      },
    );
  }

  async change(
    kind: NetWorthKind,
    id: string,
    body: WriteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    const intended = await this.activeBudget(this.prisma);
    const table = TABLES[kind];

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, kind, act: 'change', id, ...this.intentOf(body) },
        decode: decodeItem,
      },
      async (tx) => {
        const budget = await this.activeBudget(tx, intended.id);
        this.checkDay(body, budget.timezone);

        const [written] = await table.update(tx, id, valuesOf(body));
        if (!written) {
          throw refuseNetWorth(table.unknown);
        }

        return stored(written);
      },
    );
  }

  async remove(
    kind: NetWorthKind,
    id: string,
    body: DeleteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    const intended = await this.activeBudget(this.prisma);
    const table = TABLES[kind];

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { budgetId: intended.id, kind, act: 'remove', id },
        decode: decodeItem,
      },
      async (tx) => {
        await this.activeBudget(tx, intended.id);

        const held = await table.find(tx, id);
        const removed = held ? await table.remove(tx, id) : { count: 0 };
        if (!held || removed.count === 0) {
          throw refuseNetWorth(table.unknown);
        }

        return stored(held);
      },
    );
  }

  private intentOf(body: WriteNetWorthItemDto): Prisma.JsonObject {
    return { name: body.name, amount: body.amount, date: body.date ?? null };
  }

  private checkDay(body: WriteNetWorthItemDto, timezone: string): void {
    const refusal = refuseValuation(body.date ?? null, { timezone, today: todayIn(timezone) });
    if (refusal !== null) {
      throw refuseNetWorth(refusal);
    }
  }

  private async activeBudget(
    client: MutationClient | ScopedPrismaClient,
    id?: string,
  ): Promise<{ id: string; timezone: string }> {
    const budget = await client.budget.findFirst({
      where: { active: true, ...(id ? { id } : {}) },
    });
    if (!budget) {
      throw refuseNetWorth('NO_ACTIVE_BUDGET');
    }

    return budget;
  }
}
