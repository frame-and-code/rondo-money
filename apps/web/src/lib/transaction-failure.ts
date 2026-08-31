import { isTransactionRefusal, type TransactionRefusal } from '@rondo/types';

import type { MessageKey } from '@/i18n/messages';
import { saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

const BY_REASON: Record<TransactionRefusal, MessageKey> = {
  ACCOUNT_ARCHIVED: 'transactions.failAccountArchived',
  CATEGORY_HIDDEN: 'transactions.failCategoryHidden',
  CATEGORY_REQUIRED: 'transactions.failCategoryRequired',
  DATE_BEFORE_ACCOUNT: 'transactions.failBeforeAccount',
  DATE_IN_FUTURE: 'transactions.failFuture',
  NOT_EDITABLE: 'transactions.failNotEditable',
  NO_ACTIVE_BUDGET: 'transactions.failBudget',
  UNKNOWN_ACCOUNT: 'transactions.failOther',
  UNKNOWN_CATEGORY: 'transactions.failOther',
  UNKNOWN_TRANSACTION: 'transactions.failGone',
};

const BY_KIND: Record<SaveFailureKind, MessageKey> = {
  budget: 'transactions.failBudget',
  conflict: 'transactions.failConflict',
  network: 'transactions.failNetwork',
  other: 'transactions.failOther',
};

export function transactionFailure(error: unknown): MessageKey {
  const reason =
    typeof error === 'object' && error !== null && 'reason' in error ? error.reason : undefined;

  return isTransactionRefusal(reason) ? BY_REASON[reason] : BY_KIND[saveFailureKind(error)];
}
