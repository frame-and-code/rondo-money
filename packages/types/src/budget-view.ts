import { type CalendarMonth } from './calendar.js';

export interface BudgetViewCategoryDto {
  id: string;

  name: string;

  assigned: string;

  activity: string;

  available: string;
}

export interface BudgetViewGroupDto {
  id: string;

  name: string;

  categories: BudgetViewCategoryDto[];
}

export interface BudgetViewDto {
  month: CalendarMonth;

  readyToAssign: string;

  groups: BudgetViewGroupDto[];
}
