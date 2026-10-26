import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'pg';

import { AppModule } from '@/app.module';

import { createTestSigningKey } from './clerk-token';

interface OwnedTable {
  table: string;
}

interface Statistic {
  table: string;
  kinds: string[];
  columns: string[];
}

describe('what the planner is told about the tables a budget owns (integration)', () => {
  let moduleRef: TestingModule;
  let client: Client;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  beforeAll(async () => {
    process.env.CLERK_JWT_KEY = createTestSigningKey().publicKeyPem;
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    client = new Client({
      connectionString: moduleRef.get(ConfigService).getOrThrow<string>('DATABASE_URL'),
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await moduleRef.close();
    process.env.CLERK_JWT_KEY = originalJwtKey;
  });

  it('gives every table carrying an owner and a budget a dependency statistic on the pair', async () => {
    const owned = await client.query<OwnedTable>(`
      SELECT table_name AS "table"
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name IN ('user_id', 'budget_id')
      GROUP BY table_name
      HAVING count(*) = 2
      ORDER BY table_name
    `);
    const statistics = await client.query<Statistic>(`
      SELECT
        c.relname AS "table",
        s.stxkind::text[] AS "kinds",
        array_agg(a.attname::text ORDER BY a.attname) AS "columns"
      FROM pg_statistic_ext s
      JOIN pg_class c ON c.oid = s.stxrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = current_schema()
      JOIN pg_attribute a ON a.attrelid = s.stxrelid AND a.attnum = ANY (s.stxkeys)
      GROUP BY s.oid, c.relname, s.stxkind
    `);

    const tables = owned.rows.map((row) => row.table);
    const covered = new Set(
      statistics.rows
        .filter((row) => row.kinds.includes('f') && row.columns.join() === 'budget_id,user_id')
        .map((row) => row.table),
    );

    expect(tables).toContain('transaction');
    expect(tables.filter((table) => !covered.has(table))).toEqual([]);
  });
});
