import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 config (replaces the datasource `url` in schema.prisma). The URL is only used by
// Migrate; the runtime client connects through the pg driver adapter (see PrismaService).
//
// Load the workspace-root .env so Migrate sees DATABASE_URL locally; on Railway it comes
// from the real environment (the file is simply absent). A missing URL is tolerated so
// `prisma generate` still runs at postinstall without a configured database.
config({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
