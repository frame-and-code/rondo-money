import { type PrismaService } from '@/prisma/prisma.service';
import { type TransactionalPrismaClient } from '@/prisma/scoped-prisma';
import { type RequestContextService } from '@/request-context/request-context.service';

export const ACTIVE_BUDGET_RESOLVER = 'ACTIVE_BUDGET_RESOLVER';

export type ActiveBudgetResolver = (userId: string) => Promise<string | undefined>;

export type BudgetSource = PrismaService | TransactionalPrismaClient;

export function activeBudgetResolver(
  prisma: PrismaService,
  context: RequestContextService,
): ActiveBudgetResolver {
  return async (userId) => {
    const source: BudgetSource =
      (context.isInMutation() ? context.readBudgetSource() : undefined) ?? prisma;
    const active = await source.budget.findUnique({
      where: { userId_active: { userId, active: true } },
      select: { id: true },
    });

    return active?.id;
  };
}
