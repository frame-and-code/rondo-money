import type { MessageKey } from '@/i18n/messages';
import { keepsTheKey, saveFailureKind, type SaveFailureKind } from '@/lib/save-failure';

const BY_KIND: Record<SaveFailureKind, MessageKey> = {
  budget: 'settings.eraseFailed',
  conflict: 'settings.eraseFailedConflict',
  network: 'settings.eraseFailedNetwork',
  other: 'settings.eraseFailed',
};

export interface EraseFailure {
  message: MessageKey;
  keepsTheKey: boolean;
}

export function eraseFailure(error: unknown): EraseFailure {
  const kind = saveFailureKind(error);

  return { message: BY_KIND[kind], keepsTheKey: keepsTheKey(kind) };
}
