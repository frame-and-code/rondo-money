import { type CalendarMonth } from './calendar.js';
import { type CategoryColor, type CategoryIcon } from './category-look.js';
import { type BudgetViewTargetDto } from './target.js';

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

  paid: boolean;

  target: BudgetViewTargetDto | null;
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
