import { type CalendarMonth } from './calendar.js';
import { type CurrencyCode } from './currency.js';

export interface BudgetDto {
  id: string;

  name: string;

  currency: CurrencyCode;

  minorDigits: number;

  timezone: string;

  firstMonth: CalendarMonth;

  active: boolean;
}
