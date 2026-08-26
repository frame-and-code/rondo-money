import { type CurrencyCode } from './currency.js';

export interface BudgetDto {
  id: string;

  name: string;

  currency: CurrencyCode;

  minorDigits: number;

  timezone: string;

  active: boolean;
}
