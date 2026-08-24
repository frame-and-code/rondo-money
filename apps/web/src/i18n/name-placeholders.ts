import { type MessageKey } from './messages';

/// The server picks the index and hands it to the page, so the two renders agree and the
/// string comes from the dictionary of whatever language the reader chose.
const KEYS = [
  'newBudget.namePlaceholder.0',
  'newBudget.namePlaceholder.1',
  'newBudget.namePlaceholder.2',
  'newBudget.namePlaceholder.3',
  'newBudget.namePlaceholder.4',
] as const satisfies readonly MessageKey[];

export const NAME_PLACEHOLDER_COUNT = KEYS.length;

export function namePlaceholderKey(index: number): MessageKey {
  const whole = Number.isFinite(index) ? Math.trunc(index) : 0;
  const slot = ((whole % NAME_PLACEHOLDER_COUNT) + NAME_PLACEHOLDER_COUNT) % NAME_PLACEHOLDER_COUNT;

  return KEYS[slot] ?? KEYS[0];
}

export function pickNamePlaceholderIndex(): number {
  const [random] = crypto.getRandomValues(new Uint32Array(1));
  return (random ?? 0) % NAME_PLACEHOLDER_COUNT;
}
