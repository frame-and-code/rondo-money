import { type CurrencyCode } from './currency.js';

export interface BudgetDto {
  id: string;

  name: string;

  currency: CurrencyCode;

  /// Frozen when the budget is created. A reader takes the scale from here rather than
  /// recomputing it, so an amount written at one scale is never read at another.
  minorDigits: number;

  /// The IANA zone that decides what "today" is and which month an amount falls into.
  timezone: string;

  active: boolean;
}
