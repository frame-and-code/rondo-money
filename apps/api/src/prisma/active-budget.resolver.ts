import { type PrismaService } from '@/prisma/prisma.service';
import { type TransactionalPrismaClient } from '@/prisma/scoped-prisma';
import { type RequestContextService } from '@/request-context/request-context.service';

export const ACTIVE_BUDGET_RESOLVER = 'ACTIVE_BUDGET_RESOLVER';

export type ActiveBudgetResolver = (userId: string) => Promise<string | undefined>;

export type BudgetSource = PrismaService | TransactionalPrismaClient;

/// Reads the budget on the transaction in flight when there is one. On the pooled client it
/// would take a second connection and read committed state, so a mutation that has just
/// created the caller's first budget would be told they have none.
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
