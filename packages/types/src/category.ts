import { type CategoryColor, type CategoryIcon } from './category-look.js';

export const CATEGORY_REFUSALS = [
  'ALREADY_HIDDEN',
  'AVAILABLE_NOT_ZERO',
  'CATEGORY_HIDDEN',
  'DUE_MONTH_PAST',
  'GROUP_HIDDEN',
  'NO_ACTIVE_BUDGET',
  'NO_TARGET',
  'UNKNOWN_CATEGORY',
  'UNKNOWN_GROUP',
] as const;

export type CategoryRefusal = (typeof CATEGORY_REFUSALS)[number];

export function isCategoryRefusal(value: unknown): value is CategoryRefusal {
  return typeof value === 'string' && (CATEGORY_REFUSALS as readonly string[]).includes(value);
}

export interface CategoryGroupDto {
  id: string;

  name: string;

  sortOrder: number;

  hidden: boolean;
}

export interface CategoryDto {
  id: string;

  groupId: string;

  name: string;

  sortOrder: number;

  icon: CategoryIcon | null;

  color: CategoryColor | null;

  hidden: boolean;
}
