import { isCategoryRefusal, type CategoryRefusal } from '@rondo/types';

import type { MessageKey } from '@/i18n/messages';
import { saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

const BY_REASON: Record<CategoryRefusal, MessageKey> = {
  ALREADY_HIDDEN: 'categories.failAlreadyHidden',
  AVAILABLE_NOT_ZERO: 'categories.hideBlocked',
  CATEGORY_HIDDEN: 'categories.failOther',
  DUE_MONTH_PAST: 'categories.failOther',
  GROUP_HIDDEN: 'categories.failGroupHidden',
  NO_ACTIVE_BUDGET: 'categories.failBudget',
  NO_TARGET: 'categories.failOther',
  UNKNOWN_CATEGORY: 'categories.failOther',
  UNKNOWN_GROUP: 'categories.failOther',
};

const BY_KIND: Record<SaveFailureKind, MessageKey> = {
  conflict: 'categories.failConflict',
  budget: 'categories.failBudget',
  network: 'categories.failNetwork',
  other: 'categories.failOther',
};

export function categoryFailure(error: unknown): MessageKey {
  const reason =
    typeof error === 'object' && error !== null && 'reason' in error ? error.reason : undefined;

  return isCategoryRefusal(reason) ? BY_REASON[reason] : BY_KIND[saveFailureKind(error)];
}
