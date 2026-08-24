import { type MessageKey } from './messages';

/// The server picks the index and hands it to the page, so the two renders agree and the
/// string comes from the dictionary of whatever language the reader chose.
const BUDGET_KEYS = [
  'newBudget.namePlaceholder.0',
  'newBudget.namePlaceholder.1',
  'newBudget.namePlaceholder.2',
  'newBudget.namePlaceholder.3',
  'newBudget.namePlaceholder.4',
] as const satisfies readonly MessageKey[];

const ACCOUNT_KEYS = [
  'newAccount.namePlaceholder.0',
  'newAccount.namePlaceholder.1',
  'newAccount.namePlaceholder.2',
  'newAccount.namePlaceholder.3',
  'newAccount.namePlaceholder.4',
] as const satisfies readonly MessageKey[];

export const BUDGET_PLACEHOLDER_COUNT = BUDGET_KEYS.length;

export const ACCOUNT_PLACEHOLDER_COUNT = ACCOUNT_KEYS.length;

function keyAt(keys: readonly [MessageKey, ...MessageKey[]], index: number): MessageKey {
  const whole = Number.isFinite(index) ? Math.trunc(index) : 0;
  const slot = ((whole % keys.length) + keys.length) % keys.length;

  return keys[slot] ?? keys[0];
}

export function namePlaceholderKey(index: number): MessageKey {
  return keyAt(BUDGET_KEYS, index);
}

export function accountNamePlaceholderKey(index: number): MessageKey {
  return keyAt(ACCOUNT_KEYS, index);
}

/// Unbounded on purpose. Folding happens where the keys are, so a set that grows a sixth
/// example starts showing it without anyone remembering to widen the pick.
export function pickNamePlaceholderIndex(): number {
  const [random] = crypto.getRandomValues(new Uint32Array(1));
  return random ?? 0;
}
