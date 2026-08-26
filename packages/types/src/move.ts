import { type CalendarMonth } from './calendar.js';

export const MOVE_SIDE_KINDS = ['CATEGORY', 'READY_TO_ASSIGN'] as const;

export type MoveSideKind = (typeof MOVE_SIDE_KINDS)[number];

export function isMoveSideKind(value: unknown): value is MoveSideKind {
  return typeof value === 'string' && (MOVE_SIDE_KINDS as readonly string[]).includes(value);
}

export interface MoveSideDto {
  kind: MoveSideKind;

  categoryId?: string;
}

export interface MoveDto {
  month: CalendarMonth;

  amount: string;

  from: MoveSideDto;

  to: MoveSideDto;
}
