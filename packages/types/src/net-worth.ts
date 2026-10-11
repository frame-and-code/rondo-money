import { type AccountType } from './account.js';
import { type CalendarDate } from './calendar.js';

export const NET_WORTH_REFUSALS = [
  'DATE_IN_FUTURE',
  'NO_ACTIVE_BUDGET',
  'UNKNOWN_ASSET',
  'UNKNOWN_LIABILITY',
] as const;

export type NetWorthRefusal = (typeof NET_WORTH_REFUSALS)[number];

export function isNetWorthRefusal(value: unknown): value is NetWorthRefusal {
  return typeof value === 'string' && (NET_WORTH_REFUSALS as readonly string[]).includes(value);
}

export interface NetWorthItemDto {
  id: string;

  name: string;

  amount: string;

  date: CalendarDate | null;
}

export interface NetWorthItemsDto {
  items: NetWorthItemDto[];
}

export interface NetWorthAccountDto {
  id: string;

  name: string;

  type: AccountType;

  balance: string;
}

export interface NetWorthDto {
  total: string;

  accountsTotal: string;

  assetsTotal: string;

  liabilitiesTotal: string;

  accounts: NetWorthAccountDto[];

  assets: NetWorthItemDto[];

  liabilities: NetWorthItemDto[];
}
