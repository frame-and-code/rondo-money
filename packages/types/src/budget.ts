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

export const BUDGET_REFUSALS = ['UNKNOWN_BUDGET'] as const;

export type BudgetRefusal = (typeof BUDGET_REFUSALS)[number];
