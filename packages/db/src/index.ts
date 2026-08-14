/**
 * @rondo/db — Prisma client, schema, and migrations.
 *
 * Re-exports the generated Prisma 7 client (Rust-free, generated as TypeScript). The
 * package is consumed as types from source and at runtime from the compiled `dist`
 * (see package.json `exports` + the `build` step). When the userId/budgetId auto-scoping
 * Client Extension and the raw-aggregate repository arrive (Phases 1–2), they live here.
 */
export * from './generated/prisma/client.js';
