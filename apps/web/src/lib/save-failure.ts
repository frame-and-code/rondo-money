import { isMoveRefusal, type MoveRefusal } from '@rondo/types';

export type SaveFailureKind = 'conflict' | 'budget' | 'network' | 'other';

export interface SaveFailure {
  kind: SaveFailureKind;
  categoryId: string;
  categoryName: string;
}

const BY_REASON: Partial<Record<MoveRefusal, SaveFailureKind>> = {
  NO_ACTIVE_BUDGET: 'budget',
};

export function saveFailureKind(error: unknown): SaveFailureKind {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return 'network';
  }

  const { statusCode } = error;
  if (statusCode === 409) {
    return 'conflict';
  }

  if (statusCode !== 400) {
    return 'other';
  }

  const reason = 'reason' in error ? error.reason : undefined;

  return isMoveRefusal(reason) ? (BY_REASON[reason] ?? 'other') : 'other';
}

export function keepsThePopoverOpen(kind: SaveFailureKind): boolean {
  return kind !== 'budget';
}

export function keepsTheKey(kind: SaveFailureKind): boolean {
  return kind === 'network';
}

export function rereadsTheMonth(kind: SaveFailureKind): boolean {
  return kind !== 'network' && kind !== 'budget';
}
