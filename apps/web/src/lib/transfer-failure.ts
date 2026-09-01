import { isTransferRefusal, type TransferRefusal } from '@rondo/types';

import type { MessageKey } from '@/i18n/messages';
import { saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

const BY_REASON: Record<TransferRefusal, MessageKey> = {
  ACCOUNT_ARCHIVED: 'transactions.failTransferArchived',
  DATE_BEFORE_ACCOUNT: 'transactions.failBeforeAccountTransfer',
  DATE_IN_FUTURE: 'transactions.failFuture',
  NO_ACTIVE_BUDGET: 'transactions.failBudget',
  SAME_ACCOUNT: 'transactions.failSameAccount',
  UNKNOWN_ACCOUNT: 'transactions.failAccountGone',
  UNKNOWN_TRANSFER: 'transactions.failTransferGone',
};

const BY_KIND: Record<SaveFailureKind, MessageKey> = {
  budget: 'transactions.failBudget',
  conflict: 'transactions.failConflict',
  network: 'transactions.failNetwork',
  other: 'transactions.failOther',
};

export function transferFailure(error: unknown): MessageKey {
  const reason =
    typeof error === 'object' && error !== null && 'reason' in error ? error.reason : undefined;

  return isTransferRefusal(reason) ? BY_REASON[reason] : BY_KIND[saveFailureKind(error)];
}
