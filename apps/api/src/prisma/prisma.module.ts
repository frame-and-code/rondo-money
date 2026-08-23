import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ActiveBudgetInterceptor } from '@/prisma/active-budget.interceptor';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: ActiveBudgetInterceptor },
    {
      provide: SCOPED_PRISMA,
      inject: [PrismaService, RequestContextService],
      useFactory: (prisma: PrismaService, context: RequestContextService): ScopedPrismaClient =>
        withUserScoping(prisma, context),
    },
  ],
  exports: [PrismaService, SCOPED_PRISMA],
})
export class PrismaModule {}
