import { type withUserScoping } from '@/prisma/user-scoping.extension';

/**
 * What domain modules inject to reach the database: the Prisma client with `userId`
 * auto-scoping applied (ADR-005).
 *
 * A token rather than a class because the scoped client is what `$extends` returns, not
 * something we can subclass. `PrismaService` — the unscoped client underneath — stays
 * injectable for the two callers that legitimately need it (the raw-SQL repository and test
 * fixtures); everything else asks for this.
 */
export const SCOPED_PRISMA = 'SCOPED_PRISMA';

/** The type behind {@link SCOPED_PRISMA}, for constructor parameters. */
export type ScopedPrismaClient = ReturnType<typeof withUserScoping>;
