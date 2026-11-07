import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { type AuthFailureCounter, type FailureCount } from '@/auth/auth-failure-limiter';
import { PrismaService } from '@/prisma/prisma.service';

interface CountedRow {
  hits: number;
  window_end: Date;
}

@Injectable()
export class AuthFailureStore implements AuthFailureCounter {
  constructor(private readonly prisma: PrismaService) {}

  async record(clientKey: string): Promise<FailureCount> {
    const rows = await this.prisma.$queryRaw<CountedRow[]>(Prisma.sql`
      WITH counted AS (
        INSERT INTO auth_failure (client_key, window_start, hits)
        VALUES (${clientKey}, date_trunc('minute', now()), 1)
        ON CONFLICT (client_key, window_start)
          DO UPDATE SET hits = auth_failure.hits + 1
        RETURNING hits, window_start
      ), swept AS (
        DELETE FROM auth_failure WHERE window_start < date_trunc('minute', now())
      )
      SELECT hits, window_start + interval '1 minute' AS window_end FROM counted
    `);

    const [row] = rows;
    if (row === undefined) {
      throw new Error(`Counting a failed authentication returned no row for ${clientKey}`);
    }

    return { hits: row.hits, windowEnd: row.window_end };
  }
}
