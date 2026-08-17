import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';

/**
 * The one raw query in the application that is deliberately **not** scoped to a user.
 *
 * It lives here, beside the scoped repository, so that the lint rule guarding ADR-005 has
 * exactly one allowed directory and the codebase has no `eslint-disable` for raw SQL. A rule
 * with exceptions scattered across controllers teaches everyone to silence it; one directory
 * can be read top to bottom by a reviewer.
 *
 * Why it is safe unscoped: the statement is a constant with no parameters and returns no
 * data, and its caller (`GET /health`) is anonymous by design — Railway's probe sends no
 * token, so there is no user to scope by in the first place.
 */
@Injectable()
export class DatabaseProbe {
  constructor(private readonly prisma: PrismaService) {}

  /** Round-trips to Postgres. Throws if the database is unreachable. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
  }
}
