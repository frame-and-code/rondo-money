import {
  calendarDateIn,
  type CalendarDate,
  type Money,
  type TransactionEntryType,
  type TransactionRefusal,
} from '@rondo/types';

export interface EntryAccount {
  createdAt: Date;
  archivedAt: Date | null;
}

export interface EntryCategory {
  hiddenAt: Date | null;
}

export interface EntryDraft {
  type: TransactionEntryType;
  date: CalendarDate;
  account: EntryAccount;
  category: EntryCategory | null;
  categoryChanged: boolean;
}

export interface StoredEntry {
  isSystem: boolean;
  transferId: string | null;
}

export interface BudgetClock {
  timezone: string;
  today: CalendarDate;
}

export function signedAmount(type: TransactionEntryType, amount: Money): Money {
  return type === 'EXPENSE' ? -amount : amount;
}

export function refuseDraft(draft: EntryDraft, clock: BudgetClock): TransactionRefusal | null {
  if (draft.account.archivedAt !== null) {
    return 'ACCOUNT_ARCHIVED';
  }

  if (draft.date > clock.today) {
    return 'DATE_IN_FUTURE';
  }

  if (draft.date < calendarDateIn(draft.account.createdAt, clock.timezone)) {
    return 'DATE_BEFORE_ACCOUNT';
  }

  if (draft.category === null) {
    return draft.type === 'EXPENSE' ? 'CATEGORY_REQUIRED' : null;
  }

  return draft.category.hiddenAt !== null && draft.categoryChanged ? 'CATEGORY_HIDDEN' : null;
}

export function refuseTarget(entry: StoredEntry): TransactionRefusal | null {
  return entry.isSystem || entry.transferId !== null ? 'NOT_EDITABLE' : null;
}
