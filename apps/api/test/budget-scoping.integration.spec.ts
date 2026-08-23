import { type Server } from 'node:http';

import { Controller, Get, Inject, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const WITH_ACTIVE = 'user_2rondoBudgetAaaaaaaaaaaaa';
const WITHOUT_ACTIVE = 'user_2rondoBudgetBbbbbbbbbbbbb';
const USERS = [WITH_ACTIVE, WITHOUT_ACTIVE];

@Controller('test-budget')
class BudgetProbeController {
  constructor(
    private readonly context: RequestContextService,
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  @Get('active')
  active(): { budgetId: string | null } {
    return { budgetId: this.context.readBudgetId() ?? null };
  }

  @Get('categories')
  async categories(): Promise<{ names: string[] }> {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return { names: rows.map((row) => row.name) };
  }
}

describe('budget scoping (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: ScopedPrismaClient;
  let context: RequestContextService;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (sub: string): string =>
    key.signToken({ sub, iat: now, exp: now + 60, azp: webOrigin });

  const get = (path: string, sub: string): request.Test =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', `Bearer ${tokenFor(sub)}`);

  const inRequest = <T>(userId: string, budgetId: string, query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(userId);
      context.setBudgetId(budgetId);
      return await query();
    });

  const removeFixtures = async (): Promise<void> => {
    await prisma.category.deleteMany({ where: { userId: { in: USERS } } });
    await prisma.categoryGroup.deleteMany({ where: { userId: { in: USERS } } });
    await prisma.budget.deleteMany({ where: { userId: { in: USERS } } });
  };

  const createBudget = (userId: string, name: string, active: boolean) =>
    prisma.budget.create({
      data: {
        userId,
        name,
        currency: 'USD',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });

  const createCategory = async (userId: string, budgetId: string, name: string) => {
    const group = await prisma.categoryGroup.create({
      data: { userId, budgetId, name: `${name} group`, sortOrder: 0 },
    });
    return prisma.category.create({
      data: { userId, budgetId, groupId: group.id, name, sortOrder: 0 },
    });
  };

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BudgetProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    scoped = app.get<ScopedPrismaClient>(SCOPED_PRISMA);
    context = app.get(RequestContextService);
    webOrigin = resolveWebOrigin(app.get(ConfigService));
  });

  afterAll(async () => {
    if (app) {
      await removeFixtures();
      await app.close();
    }
    process.env.CLERK_JWT_KEY = originalJwtKey;
  });

  beforeEach(async () => {
    await removeFixtures();
  });

  describe('when the caller has an active budget', () => {
    let active: { id: string };
    let archived: { id: string };

    beforeEach(async () => {
      active = await createBudget(WITH_ACTIVE, 'This year', true);
      archived = await createBudget(WITH_ACTIVE, 'Last year', false);
      await createCategory(WITH_ACTIVE, active.id, 'Food');
      await createCategory(WITH_ACTIVE, archived.id, 'Old food');
    });

    it('puts the active budget into the request context', async () => {
      const response = await get('/test-budget/active', WITH_ACTIVE).expect(200);

      expect(response.body).toEqual({ budgetId: active.id });
    });

    it('reads only the rows of that budget, not the caller`s other one', async () => {
      const response = await get('/test-budget/categories', WITH_ACTIVE).expect(200);

      expect(response.body).toEqual({ names: ['Food'] });
    });

    it('takes the budget of a write from the payload, not from the context', async () => {
      const group = await prisma.categoryGroup.create({
        data: { userId: WITH_ACTIVE, budgetId: archived.id, name: 'Old', sortOrder: 1 },
      });

      const created = await inRequest(WITH_ACTIVE, active.id, () =>
        scoped.category.create({
          data: {
            userId: WITH_ACTIVE,
            budgetId: archived.id,
            groupId: group.id,
            name: 'Written elsewhere',
            sortOrder: 1,
          },
        }),
      );

      const stored = await prisma.category.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.budgetId).toBe(archived.id);
    });
  });

  describe('the one active budget a caller may hold', () => {
    it('refuses a second active budget for the same user', async () => {
      await createBudget(WITH_ACTIVE, 'One', true);

      await expect(createBudget(WITH_ACTIVE, 'Another', true)).rejects.toThrow(
        /[Uu]nique constraint/,
      );
    });

    it('lets the same user hold any number of deactivated ones', async () => {
      await createBudget(WITH_ACTIVE, 'One', true);
      await createBudget(WITH_ACTIVE, 'Last year', false);
      await createBudget(WITH_ACTIVE, 'The year before', false);

      const held = await prisma.budget.count({ where: { userId: WITH_ACTIVE } });
      expect(held).toBe(3);
    });

    it('lets two users each hold their own active budget', async () => {
      await createBudget(WITH_ACTIVE, 'Mine', true);

      await expect(createBudget(WITHOUT_ACTIVE, 'Theirs', true)).resolves.toBeDefined();
    });

    it('resolves each of them to their own, not to whichever came first', async () => {
      const mine = await createBudget(WITH_ACTIVE, 'Mine', true);
      const theirs = await createBudget(WITHOUT_ACTIVE, 'Theirs', true);

      const forMine = await get('/test-budget/active', WITH_ACTIVE).expect(200);
      const forTheirs = await get('/test-budget/active', WITHOUT_ACTIVE).expect(200);

      expect(forMine.body).toEqual({ budgetId: mine.id });
      expect(forTheirs.body).toEqual({ budgetId: theirs.id });
    });
  });

  describe('when the caller has no active budget', () => {
    beforeEach(async () => {
      const inactive = await createBudget(WITHOUT_ACTIVE, 'Retired', false);
      await createCategory(WITHOUT_ACTIVE, inactive.id, 'Nothing to see');
    });

    it('leaves the context without a budget rather than failing the request', async () => {
      const response = await get('/test-budget/active', WITHOUT_ACTIVE).expect(200);

      expect(response.body).toEqual({ budgetId: null });
    });

    it('refuses a read of a budget-scoped model instead of answering with everything', async () => {
      await get('/test-budget/categories', WITHOUT_ACTIVE).expect(500);

      const untouched = await prisma.category.findMany({ where: { userId: WITHOUT_ACTIVE } });
      expect(untouched).toHaveLength(1);
    });
  });
});
