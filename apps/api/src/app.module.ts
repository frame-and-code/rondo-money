import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '@/auth/auth.module';
import { HealthModule } from '@/health/health.module';
import { MeModule } from '@/me/me.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { RawSqlModule } from '@/raw-sql/raw-sql.module';
import { RequestContextModule } from '@/request-context/request-context.module';

@Module({
  imports: [
    // Locally: the api's own .env.local (secrets, from `pnpm env:setup`) first, then the
    // workspace-root .env (no secrets). Earlier entries win; on Railway the real env vars
    // take precedence over every file.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    // The request scope has to exist before the guard can put a userId into it, but that
    // ordering comes from Nest's pipeline (middleware runs before guards), not from this
    // list; it is first here for readability only, as APP_GUARD applies app-wide whatever
    // the order.
    RequestContextModule,
    AuthModule,
    PrismaModule,
    RawSqlModule,
    HealthModule,
    MeModule,
  ],
})
export class AppModule {}
