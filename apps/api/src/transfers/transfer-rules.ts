import { calendarDateIn, type CalendarDate, type TransferRefusal } from '@rondo/types';

import { type BudgetClock } from '@/transactions/entry-rules';

export interface TransferAccount {
  id: string;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface TransferDraft {
  from: TransferAccount;
  to: TransferAccount;
  date: CalendarDate;
}

export interface TransferLeg {
  id: string;
}

export function refuseTransfer(draft: TransferDraft, clock: BudgetClock): TransferRefusal | null {
  if (draft.from.id === draft.to.id) {
    return 'SAME_ACCOUNT';
  }

  if (draft.from.archivedAt !== null || draft.to.archivedAt !== null) {
    return 'ACCOUNT_ARCHIVED';
  }

  if (draft.date > clock.today) {
    return 'DATE_IN_FUTURE';
  }

  const opened = [draft.from, draft.to]
    .map((account) => calendarDateIn(account.createdAt, clock.timezone))
    .sort()
    .at(-1);

  return opened !== undefined && draft.date < opened ? 'DATE_BEFORE_ACCOUNT' : null;
}

export function inLegWriteOrder<Leg extends TransferLeg>(legs: readonly Leg[]): Leg[] {
  return [...legs].sort((left, right) => (left.id < right.id ? -1 : 1));
}
