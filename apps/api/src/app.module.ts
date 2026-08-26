import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';

import { AccountsModule } from '@/accounts/accounts.module';
import { AuthModule } from '@/auth/auth.module';
import { BudgetViewModule } from '@/budget-view/budget-view.module';
import { BudgetsModule } from '@/budgets/budgets.module';
import { HealthModule } from '@/health/health.module';
import { MeModule } from '@/me/me.module';
import { MovesModule } from '@/moves/moves.module';
import { MutationsModule } from '@/mutations/mutations.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { RawSqlModule } from '@/raw-sql/raw-sql.module';
import { RequestContextModule } from '@/request-context/request-context.module';
import { UserSettingsModule } from '@/user-settings/user-settings.module';
import { VALIDATION_PIPE } from '@/validation/validation.options';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    RequestContextModule,
    AuthModule,
    PrismaModule,
    RawSqlModule,
    MutationsModule,
    HealthModule,
    MeModule,
    UserSettingsModule,
    BudgetsModule,
    AccountsModule,
    BudgetViewModule,
    MovesModule,
  ],
  providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
})
export class AppModule {}
