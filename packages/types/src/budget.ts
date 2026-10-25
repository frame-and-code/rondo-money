import { type CalendarDate, type CalendarMonth } from './calendar.js';
import { type CurrencyCode } from './currency.js';

export interface BudgetDto {
  id: string;

  name: string;

  currency: CurrencyCode;

  minorDigits: number;

  timezone: string;

  firstMonth: CalendarMonth;

  createdOn: CalendarDate;

  active: boolean;
}

export const BUDGET_REFUSALS = ['UNKNOWN_BUDGET', 'TEMPLATE_WITH_DEFAULTS', 'NAME_TAKEN'] as const;

export type BudgetRefusal = (typeof BUDGET_REFUSALS)[number];

export function isBudgetRefusal(value: unknown): value is BudgetRefusal {
  return typeof value === 'string' && (BUDGET_REFUSALS as readonly string[]).includes(value);
}
