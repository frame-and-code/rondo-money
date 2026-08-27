export const CATEGORY_ICONS = [
  'home',
  'bolt',
  'wifi',
  'cart',
  'car',
  'coffee',
  'music',
  'heart',
  'repeat',
  'shield',
  'dots',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === 'string' && (CATEGORY_ICONS as readonly string[]).includes(value);
}

export const CATEGORY_COLORS = [
  'blue',
  'cyan',
  'teal',
  'green',
  'amber',
  'orange',
  'rose',
  'violet',
  'plum',
  'slate',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && (CATEGORY_COLORS as readonly string[]).includes(value);
}
