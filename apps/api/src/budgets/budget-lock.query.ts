import { Prisma } from '@rondo/db';

import { type RawQueryScope } from '@/raw-sql/scoped-raw.repository';

export function budgetsLockStatement(scope: RawQueryScope): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id AS "id"
    FROM budget b
    WHERE b.user_id = ${scope.userId}
    ORDER BY b.id
    FOR UPDATE
  `;
}

export function budgetsGateStatement(scope: RawQueryScope): Prisma.Sql {
  return Prisma.sql`
    SELECT 1 AS "held"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${scope.userId}, 0))) AS gate
  `;
}
