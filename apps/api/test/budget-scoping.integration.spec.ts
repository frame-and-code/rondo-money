import { type Server } from 'node:http';

import { Controller, Get, Inject, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
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

  @Get('after-read')
  async afterRead(): Promise<{ budgetId: string | null }> {
    await this.prisma.category.findMany();
    return { budgetId: this.context.readBudgetId() ?? null };
  }
}

describe('budget scoping (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: MutatorPrismaClient;
  let context: RequestContextService;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;
  const asked: string[] = [];

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

  const inMutation = <T>(userId: string, budgetId: string, query: () => Promise<T>): Promise<T> =>
    inRequest(userId, budgetId, () => context.runInMutation(query));

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
    })
      .overrideProvider(ACTIVE_BUDGET_RESOLVER)
      .useFactory({
        inject: [PrismaService, RequestContextService],
        factory: (unscoped: PrismaService, scope: RequestContextService): ActiveBudgetResolver => {
          const resolve = activeBudgetResolver(unscoped, scope);
          return (userId) => {
            asked.push(userId);
            return resolve(userId);
          };
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    scoped = app.get<MutatorPrismaClient>(MUTATOR_PRISMA);
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
    asked.length = 0;
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

    it('resolves the budget on the first read that needs one', async () => {
      const response = await get('/test-budget/after-read', WITH_ACTIVE).expect(200);

      expect(response.body).toEqual({ budgetId: active.id });
      expect(asked).toEqual([WITH_ACTIVE]);
    });

    it('resolves nothing at all on a request that reads no budget-owned model', async () => {
      const response = await get('/test-budget/active', WITH_ACTIVE).expect(200);

      expect(response.body).toEqual({ budgetId: null });
      expect(asked).toEqual([]);
    });

    it('reads only the rows of that budget, not the caller`s other one', async () => {
      const response = await get('/test-budget/categories', WITH_ACTIVE).expect(200);

      expect(response.body).toEqual({ names: ['Food'] });
    });

    it('confines a bulk write to the active budget, leaving the other one alone', async () => {
      const renamed = await inMutation(WITH_ACTIVE, active.id, () =>
        scoped.category.updateMany({ data: { name: 'renamed' } }),
      );

      const names = await prisma.category
        .findMany({ where: { userId: WITH_ACTIVE }, orderBy: { name: 'asc' } })
        .then((rows) => rows.map((row) => row.name));

      expect(renamed).toEqual({ count: 1 });
      expect(names).toEqual(['Old food', 'renamed']);
    });

    it('confines a bulk delete the same way', async () => {
      const removed = await inMutation(WITH_ACTIVE, active.id, () =>
        scoped.category.deleteMany({}),
      );

      const left = await prisma.category
        .findMany({ where: { userId: WITH_ACTIVE } })
        .then((rows) => rows.map((row) => row.name));

      expect(removed).toEqual({ count: 1 });
      expect(left).toEqual(['Old food']);
    });

    it('takes the budget of a write from the payload, not from the context', async () => {
      const group = await prisma.categoryGroup.create({
        data: { userId: WITH_ACTIVE, budgetId: archived.id, name: 'Old', sortOrder: 1 },
      });

      const created = await inMutation(WITH_ACTIVE, active.id, () =>
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

      const forMine = await get('/test-budget/after-read', WITH_ACTIVE).expect(200);
      const forTheirs = await get('/test-budget/after-read', WITHOUT_ACTIVE).expect(200);

      expect(forMine.body).toEqual({ budgetId: mine.id });
      expect(forTheirs.body).toEqual({ budgetId: theirs.id });
    });

    it('gives two requests running side by side their own budget, not one another`s', async () => {
      const mine = await createBudget(WITH_ACTIVE, 'Mine', true);
      const theirs = await createBudget(WITHOUT_ACTIVE, 'Theirs', true);
      await createCategory(WITH_ACTIVE, mine.id, 'Mine only');
      await createCategory(WITHOUT_ACTIVE, theirs.id, 'Theirs only');

      const [forMine, forTheirs] = await Promise.all([
        get('/test-budget/categories', WITH_ACTIVE),
        get('/test-budget/categories', WITHOUT_ACTIVE),
      ]);

      expect(forMine.body).toEqual({ names: ['Mine only'] });
      expect(forTheirs.body).toEqual({ names: ['Theirs only'] });
    });

    it('asks the database for no budget on a route that touches no table', async () => {
      const lookups = jest.spyOn(prisma.budget, 'findUnique');

      try {
        await get('/me', WITH_ACTIVE).expect(200);

        expect(lookups).not.toHaveBeenCalled();
      } finally {
        lookups.mockRestore();
      }
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
