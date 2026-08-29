export function byId(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export interface OrderedRow {
  id: string;
  sortOrder: number;
}

export interface HeldRow {
  id: string;
  sortOrder: number;
}

export function wholeOrder(asked: readonly string[], held: readonly HeldRow[]): string[] {
  const named = new Set(asked);
  const rest = held
    .filter((one) => !named.has(one.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((one) => one.id);

  return [...asked, ...rest];
}

export function inWriteOrder(ids: readonly string[]): OrderedRow[] {
  return ids
    .map((id, sortOrder) => ({ id, sortOrder }))
    .sort((left, right) => byId(left.id, right.id));
}
