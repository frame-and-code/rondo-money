import { Global, Module } from '@nestjs/common';

import {
  ACTIVE_BUDGET_RESOLVER,
  activeBudgetResolver,
  type ActiveBudgetResolver,
} from '@/prisma/active-budget.resolver';
import { PrismaService } from '@/prisma/prisma.service';
import {
  MUTATOR_PRISMA,
  SCOPED_PRISMA,
  type MutatorPrismaClient,
  type ScopedPrismaClient,
} from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: ACTIVE_BUDGET_RESOLVER,
      inject: [PrismaService, RequestContextService],
      useFactory: activeBudgetResolver,
    },
    {
      provide: MUTATOR_PRISMA,
      inject: [PrismaService, RequestContextService, ACTIVE_BUDGET_RESOLVER],
      useFactory: (
        prisma: PrismaService,
        context: RequestContextService,
        resolveActiveBudget: ActiveBudgetResolver,
      ): MutatorPrismaClient => withUserScoping(prisma, context, resolveActiveBudget),
    },
    {
      provide: SCOPED_PRISMA,
      inject: [PrismaService, RequestContextService, ACTIVE_BUDGET_RESOLVER],
      useFactory: (
        prisma: PrismaService,
        context: RequestContextService,
        resolveActiveBudget: ActiveBudgetResolver,
      ): ScopedPrismaClient =>
        withUserScoping(prisma, context, resolveActiveBudget, { boundary: true }),
    },
  ],
  exports: [PrismaService, SCOPED_PRISMA, MUTATOR_PRISMA],
})
export class PrismaModule {}
