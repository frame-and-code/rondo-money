import { isAccountRefusal, type AccountRefusal } from '@rondo/types';

import type { MessageKey } from '@/i18n/messages';
import { saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

const BY_REASON: Record<AccountRefusal, MessageKey> = {
  NO_ACTIVE_BUDGET: 'transactions.failBudget',
  OPENING_FROZEN: 'transactions.failOpeningFrozen',
  UNKNOWN_ACCOUNT: 'transactions.failOther',
};

const BY_KIND: Record<SaveFailureKind, MessageKey> = {
  budget: 'transactions.failBudget',
  conflict: 'transactions.failConflict',
  network: 'transactions.failNetwork',
  other: 'transactions.failOther',
};

export function accountFailure(error: unknown): MessageKey {
  const reason =
    typeof error === 'object' && error !== null && 'reason' in error ? error.reason : undefined;

  return isAccountRefusal(reason) ? BY_REASON[reason] : BY_KIND[saveFailureKind(error)];
}
