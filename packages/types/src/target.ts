import { type CalendarMonth } from './calendar.js';

export const TARGET_KINDS = ['REFILL_TO', 'CONTRIBUTE', 'BY_DATE', 'ACCUMULATE'] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

export function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === 'string' && (TARGET_KINDS as readonly string[]).includes(value);
}

export interface CategoryTargetDto {
  kind: TargetKind;

  amount: string;

  startMonth: CalendarMonth;

  dueMonth?: CalendarMonth;

  endMonth?: CalendarMonth;
}

export interface BudgetViewTargetDto {
  kind: TargetKind;

  amount: string;

  startMonth: CalendarMonth;

  dueMonth?: CalendarMonth;

  monthTarget?: string;

  needed?: string;

  progress: string;

  remaining: string;
}
