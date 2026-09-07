import { type CalendarMonth } from './calendar.js';

export interface CategoryPaidMonthDto {
  categoryId: string;

  month: CalendarMonth;

  paid: boolean;
}
