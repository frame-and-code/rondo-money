import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

/**
 * The single Prisma client for the app, managed by Nest's lifecycle. Prisma 7's Rust-free
 * client connects through a driver adapter (pg) rather than a datasource URL.
 *
 * ⚠️ **This client is not scoped.** It is the raw connection the auto-scoping extension is
 * built on (`SCOPED_PRISMA`), and a query issued through it carries no `userId` filter at
 * all. Three callers may legitimately use it, none of them touching tenant data unscoped:
 * `ScopedRawRepository`, which scopes raw SQL itself; `DatabaseProbe`, whose single statement
 * is the healthcheck's `SELECT 1`; and test fixtures cleaning up rows across users. Domain
 * modules inject `SCOPED_PRISMA` instead — reaching for this one there is how ADR-005 gets
 * bypassed, which is why the lint rule refuses the import outside those places.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
