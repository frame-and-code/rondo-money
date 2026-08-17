import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '@/auth/auth.module';
import { HealthModule } from '@/health/health.module';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [
    // Locally: the api's own .env.local (secrets, from `pnpm env:setup`) first, then the
    // workspace-root .env (no secrets). Earlier entries win; on Railway the real env vars
    // take precedence over every file.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    // Imported before the feature modules for readability only — APP_GUARD applies app-wide
    // whatever the order.
    AuthModule,
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
