import { type CalendarMonth } from './calendar.js';
import { type CategoryColor, type CategoryIcon } from './category-look.js';

export interface BudgetViewCategoryDto {
  id: string;

  name: string;

  icon: CategoryIcon | null;

  color: CategoryColor | null;

  assigned: string;

  activity: string;

  available: string;

  availableAllTime: string;

  hidden: boolean;
}

export interface BudgetViewGroupDto {
  id: string;

  name: string;

  hidden: boolean;

  categories: BudgetViewCategoryDto[];
}

export interface BudgetViewDto {
  month: CalendarMonth;

  readyToAssign: string;

  groups: BudgetViewGroupDto[];
}
