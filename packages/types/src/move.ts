import { type CalendarMonth } from './calendar.js';

/// The two kinds of envelope money can sit in. Ready to assign is not a row anywhere: it is
/// derived from every assignment, so a side naming it writes nothing and moves on its own.
export const MOVE_SIDE_KINDS = ['CATEGORY', 'READY_TO_ASSIGN'] as const;

export type MoveSideKind = (typeof MOVE_SIDE_KINDS)[number];

export function isMoveSideKind(value: unknown): value is MoveSideKind {
  return typeof value === 'string' && (MOVE_SIDE_KINDS as readonly string[]).includes(value);
}

export interface MoveSideDto {
  kind: MoveSideKind;

  /// Carried by a category side and by no other. A side naming ready to assign has no row to
  /// name, and one carrying an id anyway states an intent that reads two ways.
  categoryId?: string;
}

export interface MoveDto {
  month: CalendarMonth;

  /// Minor units, above zero. The direction lives in the two sides, so a negative amount here
  /// would be the same move written the other way round.
  amount: string;

  from: MoveSideDto;

  to: MoveSideDto;
}
