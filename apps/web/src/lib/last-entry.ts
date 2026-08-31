import { parseCalendarDate } from '@rondo/types';

export interface LastEntry {
  date: string | null;
  categoryId: string | null;
  payee: string | null;
}

export const NO_LAST_ENTRY: LastEntry = { date: null, categoryId: null, payee: null };

const STORAGE_KEY = 'rondo.lastEntry';

function storageKey(budgetId: string): string {
  return `${STORAGE_KEY}:${budgetId}`;
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return parseCalendarDate(value);
  } catch {
    return null;
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function readLastEntry(budgetId: string): LastEntry {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey(budgetId));
  } catch {
    return NO_LAST_ENTRY;
  }

  if (stored === null) {
    return NO_LAST_ENTRY;
  }

  let held: unknown;
  try {
    held = JSON.parse(stored);
  } catch {
    return NO_LAST_ENTRY;
  }

  if (typeof held !== 'object' || held === null) {
    return NO_LAST_ENTRY;
  }

  const { date, categoryId, payee } = held as Record<string, unknown>;

  return {
    date: dateOrNull(date),
    categoryId: textOrNull(categoryId),
    payee: textOrNull(payee),
  };
}

export function storeLastEntry(budgetId: string, entry: LastEntry): void {
  try {
    window.localStorage.setItem(storageKey(budgetId), JSON.stringify(entry));
  } catch {} // eslint-disable-line no-empty -- best effort; storage may be unavailable
}
