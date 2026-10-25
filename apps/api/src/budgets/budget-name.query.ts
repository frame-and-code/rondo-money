import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export function budgetNamedStatement(
  scope: RawQueryScope,
  name: string,
  except: string | null,
): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id AS "id"
    FROM budget b
    WHERE b.user_id = ${scope.userId}
      AND lower(b.name) = lower(${name})
      AND (${except}::uuid IS NULL OR b.id <> ${except}::uuid)
    LIMIT 1
  `;
}
