import { serializeMoney } from '@rondo/types';

import {
  categoryAvailableStatement,
  categoryLockStatement,
  type CategoryAvailableRow,
  type CategoryLockRow,
} from '@/categories/category-available.query';
import { refuse } from '@/categories/category-refusal';
import { type MutationClient } from '@/mutations/mutation.service';
import { type ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

export async function lockCategories(
  raw: ScopedRawRepository,
  tx: MutationClient,
  budgetId: string,
  categoryIds: readonly string[],
): Promise<CategoryLockRow[]> {
  if (categoryIds.length === 0) {
    return [];
  }

  return raw.query<CategoryLockRow>(
    (scope) => categoryLockStatement(scope, budgetId, categoryIds),
    tx,
  );
}

export async function availableOf(
  raw: ScopedRawRepository,
  tx: MutationClient,
  budgetId: string,
  categoryIds: readonly string[],
): Promise<Map<string, bigint>> {
  const held = new Map<string, bigint>(categoryIds.map((id) => [id, 0n]));
  if (categoryIds.length === 0) {
    return held;
  }

  const rows = await raw.query<CategoryAvailableRow>(
    (scope) => categoryAvailableStatement(scope, budgetId, categoryIds),
    tx,
  );

  for (const row of rows) {
    held.set(row.categoryId, row.available);
  }

  return held;
}

export function refuseWhatStillHoldsMoney(held: Map<string, bigint>, subject: string): void {
  for (const [categoryId, amount] of held) {
    if (amount !== 0n) {
      throw refuse(
        'AVAILABLE_NOT_ZERO',
        `${subject} still holds money over every month, and hiding it would put that money ` +
          'where nobody can see it. Move the remainder out first.',
        { available: serializeMoney(amount), categoryId },
      );
    }
  }
}
