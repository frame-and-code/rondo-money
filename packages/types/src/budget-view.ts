import { type CalendarMonth } from './calendar.js';

export interface BudgetViewCategoryDto {
  id: string;

  name: string;

  /// What the `Assignment` row for this month holds, and nothing else. Last month's leftover
  /// is not added in: it shows up as `available` being larger than this.
  assigned: string;

  /// The month's own transactions, signed.
  activity: string;

  /// Assigned and activity from the beginning of time up to and including this month.
  available: string;
}

export interface BudgetViewGroupDto {
  id: string;

  name: string;

  categories: BudgetViewCategoryDto[];
}

export interface BudgetViewDto {
  month: CalendarMonth;

  /// Money that has arrived and has not been given a job yet. It belongs to the budget rather
  /// than to a month: an assignment to any month, future ones included, lowers it at once.
  readyToAssign: string;

  groups: BudgetViewGroupDto[];
}
