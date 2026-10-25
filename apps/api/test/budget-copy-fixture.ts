import { monthOf, nextCalendarMonth, previousCalendarMonth, todayIn } from '@rondo/types';

import { type CategoryHarness } from './category-harness';

export const COPY_ZONE = 'Europe/Warsaw';

export async function seedOpened(
  harness: CategoryHarness,
  userId: string,
  budgetId: string,
  name: string,
  opening: bigint,
  over: Record<string, unknown> = {},
) {
  const account = await harness.seedAccount(userId, budgetId, { name, type: 'DEBIT', ...over });
  await harness.prisma.transaction.create({
    data: {
      userId,
      budgetId,
      accountId: account.id,
      date: new Date(`${todayIn(COPY_ZONE)}T00:00:00.000Z`),
      amount: opening,
      type: 'INCOME',
      isSystem: true,
    },
  });

  return account;
}

export async function seedTemplate(
  harness: CategoryHarness,
  userId: string,
  over: Record<string, unknown> = {},
) {
  const today = todayIn(COPY_ZONE);
  const month = monthOf(today);

  const budget = await harness.seedBudget(userId, { name: 'Исходный', ...over });
  const home = await harness.seedGroup(userId, budget.id, 'Дом', 0);
  const life = await harness.seedGroup(userId, budget.id, 'Жизнь', 1);
  const housing = await harness.seedCategory(userId, budget.id, home.id, 'Жильё', 0);
  const power = await harness.seedCategory(userId, budget.id, home.id, 'Свет', 1);
  const food = await harness.seedCategory(userId, budget.id, life.id, 'Еда', 0);
  await harness.prisma.category.update({
    where: { id: housing.id },
    data: { icon: 'home', color: 'blue' },
  });
  await harness.prisma.category.update({
    where: { id: food.id },
    data: { icon: 'shopping-cart', color: 'green' },
  });

  const card = await seedOpened(harness, userId, budget.id, 'Карта', 100_000n);
  const cash = await seedOpened(harness, userId, budget.id, 'Наличные', 20_000n, { type: 'CASH' });
  await harness.seedIncome(userId, budget.id, card.id, today, 50_000n);
  await harness.seedExpense(userId, budget.id, card.id, food.id, today, -12_300n);
  await harness.seedAssignment(userId, budget.id, housing.id, month, 60_000n);
  await harness.seedAssignment(userId, budget.id, food.id, month, 30_000n);
  await harness.seedAssignment(userId, budget.id, power.id, nextCalendarMonth(month), 5_000n);
  await harness.seedPaid(userId, budget.id, housing.id, month);
  await harness.seedAsset(userId, budget.id, { name: 'Машина', amount: 5_000_000n, date: today });
  await harness.seedAsset(userId, budget.id, { name: 'Гараж', amount: 900_000n });
  await harness.seedLiability(userId, budget.id, {
    name: 'Долг брату',
    amount: 120_000n,
    date: today,
  });
  await harness.seedLiability(userId, budget.id, { name: 'Рассрочка', amount: 45_000n });

  return { budget, home, life, housing, power, food, card, cash };
}

export async function seedLiveGoal(
  harness: CategoryHarness,
  userId: string,
  budgetId: string,
  categoryId: string,
) {
  return harness.seedTarget(userId, budgetId, categoryId, {
    kind: 'CONTRIBUTE',
    amount: 50_000n,
    startMonth: previousCalendarMonth(monthOf(todayIn(COPY_ZONE))),
  });
}

export async function rowsOf(harness: CategoryHarness, userId: string) {
  const where = { userId };
  const { prisma } = harness;

  return {
    budgets: await prisma.budget.count({ where }),
    groups: await prisma.categoryGroup.count({ where }),
    categories: await prisma.category.count({ where }),
    targets: await prisma.categoryTarget.count({ where }),
    paidMonths: await prisma.categoryPaidMonth.count({ where }),
    accounts: await prisma.account.count({ where }),
    transactions: await prisma.transaction.count({ where }),
    assignments: await prisma.assignment.count({ where }),
    assets: await prisma.asset.count({ where }),
    liabilities: await prisma.liability.count({ where }),
  };
}
