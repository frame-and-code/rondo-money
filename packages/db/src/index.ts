/**
 * @rondo/db — Prisma client, schema, and migrations.
 *
 * Re-exports the generated Prisma 7 client (Rust-free, generated as TypeScript). The
 * package is consumed as types from source and at runtime from the compiled `dist`
 * (see package.json `exports` + the `build` step) — which is why a migration must be followed
 * by `pnpm --filter @rondo/db build`, not just `prisma generate`.
 *
 * Schema and client only. The `userId` auto-scoping Client Extension and the raw-SQL
 * repository live in `apps/api` (`src/prisma`, `src/raw-sql`): both read the caller from the
 * request context, and the lint rule guarding raw SQL allows exactly one directory there.
 */
export * from './generated/prisma/client.js';
