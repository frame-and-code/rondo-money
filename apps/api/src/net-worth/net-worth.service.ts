import { Inject, Injectable } from '@nestjs/common';
import { isAccountType, parseCalendarDate, serializeMoney } from '@rondo/types';

import { NetWorthItemResponse } from '@/net-worth/net-worth-item.response';
import { refuseNetWorth } from '@/net-worth/net-worth-refusal';
import { netWorthStatement, type NetWorthRow } from '@/net-worth/net-worth.query';
import { NetWorthAccountResponse, NetWorthResponse } from '@/net-worth/net-worth.response';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

function unreadable(row: NetWorthRow): Error {
  const { kind, id, name, type, amount } = row;

  return new Error(
    `A row of kind ${String(kind)} came back from the net worth statement without the fields ` +
      `that kind carries: ${JSON.stringify({ id, name, type, amount: amount?.toString() ?? null })}`,
  );
}

function account(row: NetWorthRow): NetWorthAccountResponse {
  const { id, name, type, amount } = row;
  if (id === null || name === null || amount === null || !isAccountType(type)) {
    throw unreadable(row);
  }

  return { id, name, type, balance: serializeMoney(amount) };
}

function item(row: NetWorthRow): NetWorthItemResponse {
  const { id, name, amount, day } = row;
  if (id === null || name === null || amount === null) {
    throw unreadable(row);
  }

  return {
    id,
    name,
    amount: serializeMoney(amount),
    date: day === null ? null : parseCalendarDate(day),
  };
}

@Injectable()
export class NetWorthService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly raw: ScopedRawRepository,
  ) {}

  async read(): Promise<NetWorthResponse> {
    const budget = await this.prisma.budget.findFirst({ where: { active: true } });
    if (!budget) {
      throw refuseNetWorth('NO_ACTIVE_BUDGET');
    }

    const rows = await this.raw.query<NetWorthRow>((scope) => netWorthStatement(scope, budget.id));

    const [first] = rows;
    if (!first) {
      throw new Error(
        'The net worth statement answered with no rows: it always returns at least one, ' +
          'carrying the totals, so an empty answer means the statement no longer starts from them.',
      );
    }

    const worth: NetWorthResponse = {
      total: serializeMoney(first.total),
      accountsTotal: serializeMoney(first.accountsTotal),
      assetsTotal: serializeMoney(first.assetsTotal),
      liabilitiesTotal: serializeMoney(first.liabilitiesTotal),
      accounts: [],
      assets: [],
      liabilities: [],
    };

    for (const row of rows) {
      if (row.kind === null) continue;

      if (row.kind === 'account') worth.accounts.push(account(row));
      else if (row.kind === 'asset') worth.assets.push(item(row));
      else if (row.kind === 'liability') worth.liabilities.push(item(row));
      else throw unreadable(row);
    }

    return worth;
  }
}
