import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionType } from '@rondo/db';
import { parseCalendarDate, parseCalendarMonth, toDbDate, toDbMonth } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

export interface ViewCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  assigned: string;
  activity: string;
  available: string;
  availableAllTime: string;
  hidden: boolean;
}

export interface ViewGroup {
  id: string;
  name: string;
  hidden: boolean;
  categories: ViewCategory[];
}

export interface View {
  month: string;
  readyToAssign: string;
  groups: ViewGroup[];
}

export interface CategoryHarness {
  prisma: PrismaService;
  server: () => Server;
  tokenFor: (userId: string) => string;
  removeFixtures: () => Promise<void>;
  seedBudget: (userId: string, over?: Record<string, unknown>) => Promise<{ id: string }>;
  seedGroup: (
    userId: string,
    budgetId: string,
    name: string,
    sortOrder?: number,
    hiddenAt?: Date | null,
  ) => Promise<{ id: string }>;
  seedCategory: (
    userId: string,
    budgetId: string,
    groupId: string,
    name: string,
    sortOrder?: number,
    hiddenAt?: Date | null,
  ) => Promise<{ id: string }>;
  seedAccount: (userId: string, budgetId: string) => Promise<{ id: string }>;
  seedIncome: (
    userId: string,
    budgetId: string,
    accountId: string,
    date: string,
    amount: bigint,
  ) => Promise<unknown>;
  seedExpense: (
    userId: string,
    budgetId: string,
    accountId: string,
    categoryId: string,
    date: string,
    amount: bigint,
  ) => Promise<unknown>;
  seedAssignment: (
    userId: string,
    budgetId: string,
    categoryId: string,
    month: string,
    amount: bigint,
  ) => Promise<unknown>;
  viewOf: (userId: string, month: string, includeHidden?: boolean) => Promise<View>;
  close: () => Promise<void>;
}

export async function startCategoryHarness(prefix: string): Promise<CategoryHarness> {
  const key: TestSigningKey = createTestSigningKey();
  const originalJwtKey = process.env.CLERK_JWT_KEY;
  process.env.CLERK_JWT_KEY = key.publicKeyPem;

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  const webOrigin = resolveWebOrigin(app.get(ConfigService));

  const server = (): Server => app.getHttpServer() as Server;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);

    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const owned = { userId: { startsWith: prefix } };

  return {
    prisma,
    server,
    tokenFor,
    removeFixtures: async () => {
      await prisma.transaction.deleteMany({ where: owned });
      await prisma.assignment.deleteMany({ where: owned });
      await prisma.category.deleteMany({ where: owned });
      await prisma.categoryGroup.deleteMany({ where: owned });
      await prisma.account.deleteMany({ where: owned });
      await prisma.idempotencyKey.deleteMany({ where: owned });
      await prisma.budget.deleteMany({ where: owned });
      await prisma.userSettings.deleteMany({ where: owned });
    },
    seedBudget: (userId, over = {}) =>
      prisma.budget.create({
        data: {
          userId,
          name: 'Основной',
          currency: 'PLN',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active: true,
          ...over,
        },
      }),
    seedGroup: (userId, budgetId, name, sortOrder = 0, hiddenAt = null) =>
      prisma.categoryGroup.create({ data: { userId, budgetId, name, sortOrder, hiddenAt } }),
    seedCategory: (userId, budgetId, groupId, name, sortOrder = 0, hiddenAt = null) =>
      prisma.category.create({
        data: { userId, budgetId, groupId, name, sortOrder, hiddenAt },
      }),
    seedAccount: (userId, budgetId) =>
      prisma.account.create({
        data: { userId, budgetId, name: 'Кошелёк', type: 'CASH' },
      }),
    seedIncome: (userId, budgetId, accountId, date, amount) =>
      prisma.transaction.create({
        data: {
          userId,
          budgetId,
          accountId,
          date: toDbDate(parseCalendarDate(date)),
          amount,
          type: TransactionType.INCOME,
        },
      }),
    seedExpense: (userId, budgetId, accountId, categoryId, date, amount) =>
      prisma.transaction.create({
        data: {
          userId,
          budgetId,
          accountId,
          categoryId,
          date: toDbDate(parseCalendarDate(date)),
          amount,
          type: TransactionType.EXPENSE,
        },
      }),
    seedAssignment: (userId, budgetId, categoryId, month, amount) =>
      prisma.assignment.create({
        data: { userId, budgetId, categoryId, month: toDbMonth(parseCalendarMonth(month)), amount },
      }),
    viewOf: async (userId, month, includeHidden = false) => {
      const response = await request(server())
        .get(`/budget-view?month=${month}${includeHidden ? '&includeHidden=true' : ''}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      return response.body as View;
    },
    close: async () => {
      await app.close();
      process.env.CLERK_JWT_KEY = originalJwtKey;
    },
  };
}
