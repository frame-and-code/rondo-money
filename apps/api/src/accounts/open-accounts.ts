import { accountLockStatement, openAccountsStatement } from '@/accounts/account-lock.query';
import { type MutationClient } from '@/mutations/mutation.service';
import { type ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

export interface OpenAccountRow {
  id: string;
  createdAt: Date;
  archivedAt: Date | null;
}

export type AccountUnusable = 'UNKNOWN_ACCOUNT' | 'ACCOUNT_ARCHIVED';

export function refusalOfAccounts(
  wanted: readonly string[],
  held: readonly OpenAccountRow[],
): AccountUnusable | null {
  const found = new Map(held.map((row) => [row.id, row]));

  for (const id of wanted) {
    if (!found.has(id)) {
      return 'UNKNOWN_ACCOUNT';
    }
  }

  return wanted.some((id) => found.get(id)?.archivedAt != null) ? 'ACCOUNT_ARCHIVED' : null;
}

export async function heldOpenAccounts(
  raw: ScopedRawRepository,
  tx: MutationClient,
  budgetId: string,
  ids: readonly string[],
  refuse: (reason: AccountUnusable) => Error,
): Promise<ReadonlyMap<string, OpenAccountRow>> {
  const wanted = [...new Set(ids)];

  const held = await raw.query<OpenAccountRow>(
    (scope) => openAccountsStatement(scope, budgetId, wanted),
    tx,
  );

  const blocked = refusalOfAccounts(wanted, held);
  if (blocked !== null) {
    throw refuse(blocked);
  }

  return new Map(held.map((row) => [row.id, row]));
}

export async function heldOpenAccount(
  raw: ScopedRawRepository,
  tx: MutationClient,
  budgetId: string,
  id: string,
  refuse: (reason: AccountUnusable) => Error,
): Promise<OpenAccountRow> {
  const held = await raw.query<OpenAccountRow>(
    (scope) => accountLockStatement(scope, budgetId, id),
    tx,
  );

  const blocked = refusalOfAccounts([id], held);
  if (blocked !== null) {
    throw refuse(blocked);
  }

  return heldAccount(new Map(held.map((row) => [row.id, row])), id);
}

export function heldAccount(held: ReadonlyMap<string, OpenAccountRow>, id: string): OpenAccountRow {
  const row = held.get(id);
  if (!row) {
    throw new Error(
      `Account ${id} is not among the rows this write holds, and every account it named was ` +
        'taken and judged before this point, so it is using an account it never asked for.',
    );
  }

  return row;
}
