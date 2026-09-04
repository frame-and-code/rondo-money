import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export interface EraseStatement {
  model: Prisma.ModelName;
  statement: Prisma.Sql;
}

export function eraseStatement(
  scope: RawQueryScope,
  model: Prisma.ModelName,
  sparedKey: string,
): Prisma.Sql {
  const found = eraseUserDataStatements(scope, sparedKey).find((one) => one.model === model);

  if (!found) {
    throw new Error(
      `Refusing to erase ${model}: it carries the caller but no statement erases it, so the ` +
        'operation would report a clean sweep it did not make.',
    );
  }

  return found.statement;
}

export function eraseUserDataStatements(scope: RawQueryScope, sparedKey: string): EraseStatement[] {
  const { userId } = scope;

  return [
    {
      model: Prisma.ModelName.Transaction,
      statement: Prisma.sql`DELETE FROM "transaction" WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.Assignment,
      statement: Prisma.sql`DELETE FROM assignment WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.CategoryTarget,
      statement: Prisma.sql`DELETE FROM category_target WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.CategoryPaidMonth,
      statement: Prisma.sql`DELETE FROM category_paid_month WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.Category,
      statement: Prisma.sql`DELETE FROM category WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.CategoryGroup,
      statement: Prisma.sql`DELETE FROM category_group WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.Account,
      statement: Prisma.sql`DELETE FROM account WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.Budget,
      statement: Prisma.sql`DELETE FROM budget WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.UserSettings,
      statement: Prisma.sql`DELETE FROM user_settings WHERE user_id = ${userId}`,
    },
    {
      model: Prisma.ModelName.IdempotencyKey,
      statement: Prisma.sql`DELETE FROM idempotency_key WHERE user_id = ${userId} AND key <> ${sparedKey}`,
    },
  ];
}
