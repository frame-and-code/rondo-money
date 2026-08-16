import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@rondo/db';

/**
 * The single Prisma client for the app, managed by Nest's lifecycle.
 *
 * Prisma 7's Rust-free client connects through a driver adapter (pg) rather than a
 * datasource URL. Phases 1–2 wrap this with the userId/budgetId auto-scoping Client
 * Extension and the raw-aggregate repository; for now it just opens and closes.
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
