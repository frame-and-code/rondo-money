import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type OpenAPIObject } from '@nestjs/swagger';
import { monthOf, todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { resolveWebOrigin } from '@/cors';
import { createHttpApp } from '@/http-app';
import { HTTP_METHODS } from '@/openapi/document';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_MODELS } from '@/prisma/scoped-models';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoCrossTenant';
const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;
const USER_C = `${USER_PREFIX}NoBudgetC`;

const ZONE = 'Europe/Warsaw';
const NEVER_ISSUED = '0199c1a8-9ecf-71c7-a617-c575df07ffff';

const A_MARK = 'zzSecretOfA';
const A_AMOUNT = '7777777';

type Method = 'GET' | 'POST' | 'PATCH';

interface Call {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
}

interface World {
  budget: string;
  group: string;
  category: string;
  spare: string;
  account: string;
  second: string;
  record: string;
  transfer: string;
  asset: string;
  liability: string;
  payee: string;
}

interface Worlds {
  a: World;
  b: World;
}

interface Refusal {
  kind: 'path' | 'body';
  status: 404 | 400;
  reason: string;
  foreign: (victim: World, caller: World) => Call;
  own: (caller: World) => Call | Promise<Call>;
}

interface Query {
  kind: 'query';
  foreign: (victim: World) => Call;
  own: (caller: World) => Call;
}

interface Read {
  kind: 'read';
  call: () => Call;
}

interface Write {
  kind: 'write';
  call: () => Call;
}

type Probe = Refusal | Query | Read | Write;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const idOf = (body: unknown, field = 'id'): string => {
  const value = asRecord(body)[field];
  if (typeof value !== 'string') {
    throw new Error(`A response carries no string ${field}: ${JSON.stringify(body)}`);
  }

  return value;
};

const idsOf = (world: World): string[] => [
  world.budget,
  world.group,
  world.category,
  world.spare,
  world.account,
  world.second,
  world.record,
  world.transfer,
  world.asset,
  world.liability,
];

const absentWorld = (): World => ({
  budget: NEVER_ISSUED,
  group: NEVER_ISSUED,
  category: NEVER_ISSUED,
  spare: NEVER_ISSUED,
  account: NEVER_ISSUED,
  second: NEVER_ISSUED,
  record: NEVER_ISSUED,
  transfer: NEVER_ISSUED,
  asset: NEVER_ISSUED,
  liability: NEVER_ISSUED,
  payee: NEVER_ISSUED,
});

const nonPublicOperations = (document: OpenAPIObject): string[] =>
  Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      if (operation === undefined || PUBLIC_OPERATION_EXTENSION in operation) {
        return [];
      }

      return [`${method.toUpperCase()} ${path}`];
    }),
  );

const carriesId = (
  document: OpenAPIObject,
  value: unknown,
  visited: Set<string> = new Set(),
): boolean => {
  if (Array.isArray(value)) {
    return value.some((member) => carriesId(document, member, visited));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if ('format' in value && value.format === 'uuid') {
    return true;
  }
  if ('$ref' in value && typeof value.$ref === 'string') {
    const name = value.$ref.split('/').pop() ?? '';
    if (visited.has(name)) {
      return false;
    }
    visited.add(name);

    return carriesId(document, document.components?.schemas?.[name], visited);
  }

  return Object.values(value).some((member) => carriesId(document, member, visited));
};

const idCarriers = (document: OpenAPIObject): Map<string, Set<'body' | 'query'>> => {
  const carriers = new Map<string, Set<'body' | 'query'>>();

  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined || PUBLIC_OPERATION_EXTENSION in operation) {
        continue;
      }

      const kinds = new Set<'body' | 'query'>();
      if (carriesId(document, operation.requestBody)) {
        kinds.add('body');
      }
      const queryParameters = (operation.parameters ?? []).filter(
        (parameter) => 'in' in parameter && parameter.in === 'query',
      );
      if (carriesId(document, queryParameters)) {
        kinds.add('query');
      }
      if (kinds.size > 0) {
        carriers.set(`${method.toUpperCase()} ${path}`, kinds);
      }
    }
  }

  return carriers;
};

describe('every endpoint across tenants', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;
  let worlds: Worlds;
  let keys = 0;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const today = (): string => todayIn(ZONE);
  const thisMonth = (): string => monthOf(todayIn(ZONE));
  const fresh = (label: string): string => `${label}-${(keys += 1)}`;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const send = (userId: string, call: Call): request.Test => {
    const server = request(app.getHttpServer());
    const started =
      call.method === 'GET'
        ? server.get(call.path)
        : call.method === 'POST'
          ? server.post(call.path)
          : server.patch(call.path);

    const authorised = started.set('Authorization', `Bearer ${tokenFor(userId)}`);

    return call.body === undefined ? authorised : authorised.send(call.body);
  };

  const ok = async (userId: string, call: Call): Promise<unknown> => {
    const response = await send(userId, call);
    if (response.status < 200 || response.status > 299) {
      throw new Error(
        `${call.method} ${call.path} for ${userId} answered ${response.status}: ` +
          JSON.stringify(response.body),
      );
    }

    return response.body;
  };

  const post = (path: string, body: Record<string, unknown> = {}): Call => ({
    method: 'POST',
    path,
    body: { idempotencyKey: fresh('k'), ...body },
  });

  const patch = (path: string, body: Record<string, unknown>): Call => ({
    method: 'PATCH',
    path,
    body: { idempotencyKey: fresh('k'), ...body },
  });

  const get = (path: string): Call => ({ method: 'GET', path });

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.categoryPaidMonth.deleteMany({ where: owned });
    await prisma.categoryTarget.deleteMany({ where: owned });
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.asset.deleteMany({ where: owned });
    await prisma.liability.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const rowsOf = async (userId: string): Promise<Record<string, unknown[]>> => {
    const listed = await Promise.all(
      [...SCOPED_MODELS].map(async (model) => {
        const property = model.charAt(0).toLowerCase() + model.slice(1);
        const delegate: unknown = Reflect.get(prisma, property);
        const findMany: unknown =
          typeof delegate === 'object' && delegate !== null
            ? Reflect.get(delegate, 'findMany')
            : undefined;

        if (typeof findMany !== 'function') {
          throw new Error(`The client has no findMany on "${property}" for ${model}`);
        }

        const found: unknown = await Reflect.apply(findMany, delegate, [
          { where: { userId }, orderBy: { id: 'asc' } },
        ]);

        if (!Array.isArray(found)) {
          throw new Error(`findMany on ${model} returned no list`);
        }

        return [model, found] as const;
      }),
    );

    return Object.fromEntries(listed);
  };

  const buildWorld = async (userId: string, mark: string, amount: string): Promise<World> => {
    await ok(userId, get('/user-settings'));

    const budget = idOf(
      await ok(
        userId,
        post('/budgets', {
          language: 'ru',
          name: `${mark} budget`,
          currency: 'PLN',
          timezone: ZONE,
          withDefaultCategories: false,
        }),
      ),
    );

    const group = idOf(await ok(userId, post('/category-groups', { name: `${mark} group` })));
    const category = idOf(
      await ok(userId, post('/categories', { groupId: group, name: `${mark} category` })),
    );
    const spare = idOf(
      await ok(userId, post('/categories', { groupId: group, name: `${mark} spare` })),
    );

    const account = idOf(
      await ok(
        userId,
        post('/accounts', { name: `${mark} wallet`, type: 'CASH', initialBalance: amount }),
      ),
    );
    const second = idOf(
      await ok(
        userId,
        post('/accounts', { name: `${mark} card`, type: 'DEBIT', initialBalance: '0' }),
      ),
    );

    const payee = `${mark} payee`;
    const record = idOf(
      await ok(
        userId,
        post('/transactions', {
          accountId: account,
          type: 'EXPENSE',
          amount,
          date: today(),
          categoryId: category,
          payee,
        }),
      ),
    );

    const transfer = idOf(
      await ok(
        userId,
        post('/transfers', { fromAccountId: account, toAccountId: second, amount, date: today() }),
      ),
      'transferId',
    );

    await ok(
      userId,
      post('/moves', {
        month: thisMonth(),
        amount,
        from: { kind: 'READY_TO_ASSIGN' },
        to: { kind: 'CATEGORY', categoryId: category },
      }),
    );
    await ok(userId, post(`/categories/${category}/target`, { kind: 'CONTRIBUTE', amount }));
    await ok(userId, post(`/categories/${spare}/paid`, { month: thisMonth() }));

    const asset = idOf(await ok(userId, post('/assets', { name: `${mark} flat`, amount })));
    const liability = idOf(
      await ok(userId, post('/liabilities', { name: `${mark} loan`, amount })),
    );

    return {
      budget,
      group,
      category,
      spare,
      account,
      second,
      record,
      transfer,
      asset,
      liability,
      payee,
    };
  };

  const freshAccount = async (): Promise<string> =>
    idOf(
      await ok(
        USER_B,
        post('/accounts', { name: fresh('B account'), type: 'CASH', initialBalance: '0' }),
      ),
    );

  const freshCategory = async (caller: World): Promise<string> =>
    idOf(
      await ok(USER_B, post('/categories', { groupId: caller.group, name: fresh('B category') })),
    );

  const freshRecord = async (caller: World): Promise<string> =>
    idOf(
      await ok(
        USER_B,
        post('/transactions', {
          accountId: caller.account,
          type: 'EXPENSE',
          amount: '100',
          date: today(),
          categoryId: caller.category,
        }),
      ),
    );

  const freshTransfer = async (caller: World): Promise<string> =>
    idOf(
      await ok(
        USER_B,
        post('/transfers', {
          fromAccountId: caller.account,
          toAccountId: caller.second,
          amount: '100',
          date: today(),
        }),
      ),
      'transferId',
    );

  const record = (accountId: string, categoryId: string): Record<string, unknown> => ({
    accountId,
    type: 'EXPENSE',
    amount: '200',
    date: today(),
    categoryId,
  });

  const transferBody = (from: string, to: string): Record<string, unknown> => ({
    fromAccountId: from,
    toAccountId: to,
    amount: '300',
    date: today(),
  });

  const newBudget = (templateId: string): Record<string, unknown> => ({
    language: 'ru',
    name: fresh('B copy'),
    currency: 'PLN',
    timezone: ZONE,
    withDefaultCategories: false,
    templateId,
  });

  const path = (
    reason: string,
    foreign: Refusal['foreign'],
    own: Refusal['own'] = (caller) => foreign(caller, caller),
  ): Refusal => ({ kind: 'path', status: 404, reason, foreign, own });

  const body = (
    reason: string,
    foreign: Refusal['foreign'],
    own: Refusal['own'] = (caller) => foreign(caller, caller),
  ): Refusal => ({ kind: 'body', status: 400, reason, foreign, own });

  const read = (call: () => Call): Read => ({ kind: 'read', call });
  const write = (call: () => Call): Write => ({ kind: 'write', call });

  const PROBES: Record<string, Probe[]> = {
    'GET /me': [read(() => get('/me'))],
    'GET /user-settings': [read(() => get('/user-settings'))],
    'PATCH /user-settings': [write(() => patch('/user-settings', { language: 'en' }))],
    'GET /budgets': [read(() => get('/budgets'))],
    'PATCH /budgets/{id}': [
      path('UNKNOWN_BUDGET', (victim) => patch(`/budgets/${victim.budget}`, { name: fresh('B') })),
    ],
    'POST /budgets/{id}/activate': [
      path('UNKNOWN_BUDGET', (victim) => post(`/budgets/${victim.budget}/activate`)),
    ],
    'GET /accounts': [read(() => get('/accounts'))],
    'POST /accounts': [
      write(() => post('/accounts', { name: fresh('B'), type: 'CASH', initialBalance: '0' })),
    ],
    'PATCH /accounts/{id}': [
      path('UNKNOWN_ACCOUNT', (victim) =>
        patch(`/accounts/${victim.account}`, { name: fresh('B') }),
      ),
    ],
    'POST /accounts/{id}/archive': [
      path(
        'UNKNOWN_ACCOUNT',
        (victim) => post(`/accounts/${victim.account}/archive`),
        async () => post(`/accounts/${await freshAccount()}/archive`),
      ),
    ],
    'PATCH /accounts/{id}/opening-balance': [
      path(
        'UNKNOWN_ACCOUNT',
        (victim) => patch(`/accounts/${victim.account}/opening-balance`, { amount: '1' }),
        async () => patch(`/accounts/${await freshAccount()}/opening-balance`, { amount: '1' }),
      ),
    ],
    'POST /accounts/{id}/reconcile': [
      path(
        'UNKNOWN_ACCOUNT',
        (victim) => post(`/accounts/${victim.account}/reconcile`, { balance: '5' }),
        async () => post(`/accounts/${await freshAccount()}/reconcile`, { balance: '5' }),
      ),
    ],
    'GET /budget-view': [read(() => get(`/budget-view?month=${thisMonth()}`))],
    'POST /category-groups': [write(() => post('/category-groups', { name: fresh('B') }))],
    'POST /category-groups/reorder': [
      body(
        'UNKNOWN_GROUP',
        (victim, caller) =>
          post('/category-groups/reorder', { groupIds: [caller.group, victim.group] }),
        (caller) => post('/category-groups/reorder', { groupIds: [caller.group] }),
      ),
    ],
    'PATCH /category-groups/{id}': [
      path('UNKNOWN_GROUP', (victim) =>
        patch(`/category-groups/${victim.group}`, { name: fresh('B') }),
      ),
    ],
    'POST /category-groups/{id}/hide': [
      path(
        'UNKNOWN_GROUP',
        (victim) => post(`/category-groups/${victim.group}/hide`),
        async () => {
          const group = idOf(await ok(USER_B, post('/category-groups', { name: fresh('B') })));
          return post(`/category-groups/${group}/hide`);
        },
      ),
    ],
    'POST /category-groups/{id}/unhide': [
      path('UNKNOWN_GROUP', (victim) => post(`/category-groups/${victim.group}/unhide`)),
    ],
    'POST /categories': [
      body('UNKNOWN_GROUP', (victim) =>
        post('/categories', { groupId: victim.group, name: fresh('B') }),
      ),
    ],
    'POST /categories/reorder': [
      body('UNKNOWN_GROUP', (victim) =>
        post('/categories/reorder', { groupId: victim.group, categoryIds: [victim.category] }),
      ),
      body(
        'UNKNOWN_CATEGORY',
        (victim, caller) =>
          post('/categories/reorder', {
            groupId: caller.group,
            categoryIds: [caller.category, victim.category],
          }),
        (caller) =>
          post('/categories/reorder', { groupId: caller.group, categoryIds: [caller.category] }),
      ),
    ],
    'PATCH /categories/{id}': [
      path('UNKNOWN_CATEGORY', (victim) =>
        patch(`/categories/${victim.category}`, { name: fresh('B') }),
      ),
      body('UNKNOWN_GROUP', (victim, caller) =>
        patch(`/categories/${caller.spare}`, { groupId: victim.group }),
      ),
    ],
    'POST /categories/{id}/hide': [
      path(
        'UNKNOWN_CATEGORY',
        (victim) => post(`/categories/${victim.spare}/hide`),
        async (caller) => post(`/categories/${await freshCategory(caller)}/hide`),
      ),
    ],
    'POST /categories/{id}/unhide': [
      path('UNKNOWN_CATEGORY', (victim) => post(`/categories/${victim.spare}/unhide`)),
    ],
    'POST /categories/{id}/target': [
      path('UNKNOWN_CATEGORY', (victim) =>
        post(`/categories/${victim.category}/target`, { kind: 'CONTRIBUTE', amount: '10' }),
      ),
    ],
    'POST /categories/{id}/target/close': [
      path(
        'UNKNOWN_CATEGORY',
        (victim) => post(`/categories/${victim.category}/target/close`),
        async (caller) => {
          const category = await freshCategory(caller);
          await ok(
            USER_B,
            post(`/categories/${category}/target`, { kind: 'CONTRIBUTE', amount: '10' }),
          );
          return post(`/categories/${category}/target/close`);
        },
      ),
    ],
    'POST /categories/{id}/paid': [
      path('UNKNOWN_CATEGORY', (victim) =>
        post(`/categories/${victim.category}/paid`, { month: thisMonth() }),
      ),
    ],
    'POST /categories/{id}/unpaid': [
      path('UNKNOWN_CATEGORY', (victim) =>
        post(`/categories/${victim.spare}/unpaid`, { month: thisMonth() }),
      ),
    ],
    'POST /moves': [
      body('UNKNOWN_CATEGORY', (victim) =>
        post('/moves', {
          month: thisMonth(),
          amount: '1',
          from: { kind: 'READY_TO_ASSIGN' },
          to: { kind: 'CATEGORY', categoryId: victim.category },
        }),
      ),
    ],
    'POST /transactions': [
      body('UNKNOWN_ACCOUNT', (victim) =>
        post('/transactions', record(victim.account, worlds.b.category)),
      ),
      body('UNKNOWN_CATEGORY', (victim, caller) =>
        post('/transactions', record(caller.account, victim.category)),
      ),
    ],
    'GET /transactions': [
      read(() => get('/transactions')),
      {
        kind: 'query',
        foreign: (victim) => get(`/transactions?accountId=${victim.account}`),
        own: (caller) => get(`/transactions?accountId=${caller.account}`),
      },
      {
        kind: 'query',
        foreign: (victim) => get(`/transactions?categoryId=${victim.category}`),
        own: (caller) => get(`/transactions?categoryId=${caller.category}`),
      },
      {
        kind: 'query',
        foreign: (victim) => get(`/transactions?payee=${encodeURIComponent(victim.payee)}`),
        own: (caller) => get(`/transactions?payee=${encodeURIComponent(caller.payee)}`),
      },
    ],
    'GET /transactions/payees': [read(() => get('/transactions/payees'))],
    'PATCH /transactions/{id}': [
      path('UNKNOWN_TRANSACTION', (victim, caller) =>
        patch(`/transactions/${victim.record}`, record(caller.account, caller.category)),
      ),
      body('UNKNOWN_ACCOUNT', (victim, caller) =>
        patch(`/transactions/${caller.record}`, record(victim.account, caller.category)),
      ),
      body('UNKNOWN_CATEGORY', (victim, caller) =>
        patch(`/transactions/${caller.record}`, record(caller.account, victim.category)),
      ),
    ],
    'POST /transactions/{id}/delete': [
      path(
        'UNKNOWN_TRANSACTION',
        (victim) => post(`/transactions/${victim.record}/delete`),
        async (caller) => post(`/transactions/${await freshRecord(caller)}/delete`),
      ),
    ],
    'POST /transfers': [
      body(
        'UNKNOWN_ACCOUNT',
        (victim, caller) => post('/transfers', transferBody(caller.account, victim.account)),
        (caller) => post('/transfers', transferBody(caller.account, caller.second)),
      ),
    ],
    'PATCH /transfers/{transferId}': [
      path('UNKNOWN_TRANSFER', (victim, caller) =>
        patch(`/transfers/${victim.transfer}`, transferBody(caller.account, caller.second)),
      ),
      body(
        'UNKNOWN_ACCOUNT',
        (victim, caller) =>
          patch(`/transfers/${caller.transfer}`, transferBody(caller.account, victim.account)),
        (caller) =>
          patch(`/transfers/${caller.transfer}`, transferBody(caller.account, caller.second)),
      ),
    ],
    'POST /transfers/{transferId}/delete': [
      path(
        'UNKNOWN_TRANSFER',
        (victim) => post(`/transfers/${victim.transfer}/delete`),
        async (caller) => post(`/transfers/${await freshTransfer(caller)}/delete`),
      ),
    ],
    'GET /assets': [read(() => get('/assets'))],
    'POST /assets': [write(() => post('/assets', { name: fresh('B'), amount: '10' }))],
    'PATCH /assets/{id}': [
      path('UNKNOWN_ASSET', (victim) =>
        patch(`/assets/${victim.asset}`, { name: fresh('B'), amount: '10' }),
      ),
    ],
    'POST /assets/{id}/delete': [
      path(
        'UNKNOWN_ASSET',
        (victim) => post(`/assets/${victim.asset}/delete`),
        async () => {
          const asset = idOf(await ok(USER_B, post('/assets', { name: fresh('B'), amount: '1' })));
          return post(`/assets/${asset}/delete`);
        },
      ),
    ],
    'GET /liabilities': [read(() => get('/liabilities'))],
    'POST /liabilities': [write(() => post('/liabilities', { name: fresh('B'), amount: '10' }))],
    'PATCH /liabilities/{id}': [
      path('UNKNOWN_LIABILITY', (victim) =>
        patch(`/liabilities/${victim.liability}`, { name: fresh('B'), amount: '10' }),
      ),
    ],
    'POST /liabilities/{id}/delete': [
      path(
        'UNKNOWN_LIABILITY',
        (victim) => post(`/liabilities/${victim.liability}/delete`),
        async () => {
          const liability = idOf(
            await ok(USER_B, post('/liabilities', { name: fresh('B'), amount: '1' })),
          );
          return post(`/liabilities/${liability}/delete`);
        },
      ),
    ],
    'GET /net-worth': [read(() => get('/net-worth'))],
    'POST /budgets': [
      body('UNKNOWN_BUDGET', (victim) => post('/budgets', newBudget(victim.budget))),
    ],
    'POST /me/erase': [write(() => post('/me/erase'))],
  };

  const entries = (): [string, Probe][] =>
    Object.entries(PROBES).flatMap(([operation, probes]) =>
      probes.map((probe): [string, Probe] => [operation, probe]),
    );

  const refusals = (): [string, Refusal][] =>
    entries().flatMap(([operation, probe]): [string, Refusal][] =>
      probe.kind === 'path' || probe.kind === 'body' ? [[operation, probe]] : [],
    );

  const queries = (): Query[] =>
    entries().flatMap(([, probe]) => (probe.kind === 'query' ? [probe] : []));

  const reads = (): [string, Read][] =>
    entries().flatMap(([operation, probe]): [string, Read][] =>
      probe.kind === 'read' ? [[operation, probe]] : [],
    );

  const writes = (): [string, Write][] =>
    entries().flatMap(([operation, probe]): [string, Write][] =>
      probe.kind === 'write' ? [[operation, probe]] : [],
    );

  const refusalOf = (wanted: string): Refusal => {
    const found = refusals().find(([operation]) => operation === wanted);
    if (found === undefined) {
      throw new Error(`No refusal probe for ${wanted}`);
    }

    return found[1];
  };

  const writeOf = (wanted: string): Write => {
    const found = writes().find(([operation]) => operation === wanted);
    if (found === undefined) {
      throw new Error(`No write probe for ${wanted}`);
    }

    return found[1];
  };

  const ONE_OFF = new Set(['POST /budgets', 'POST /me/erase']);

  const foreignIdOf = (probe: Refusal): string => {
    const aimed = JSON.stringify(probe.foreign(worlds.a, worlds.b));
    const absent = JSON.stringify(probe.foreign(absentWorld(), worlds.b));

    return idsOf(worlds.a).find((id) => aimed.includes(id) && !absent.includes(id)) ?? NEVER_ISSUED;
  };

  const targetOf = (probe: Probe): Call => {
    switch (probe.kind) {
      case 'read':
      case 'write':
        return probe.call();
      case 'query':
        return probe.foreign(worlds.a);
      case 'path':
      case 'body':
        return probe.foreign(worlds.a, worlds.b);
    }
  };

  const reaches = (operation: string, call: Call): boolean => {
    const [method, template = ''] = operation.split(' ');
    const route = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/?]+')}(\\?.*)?$`);

    return call.method === method && route.test(call.path);
  };

  const spelled = (call: Call): string => `${call.method} ${call.path}`;

  const withoutId = (message: unknown, id: string): string =>
    String(message).split(id).join('<id>');

  let baseline: Map<string, string>;
  let snapshotOfA: Record<string, unknown[]>;
  let contract: OpenAPIObject;

  const expectAUntouched = async (): Promise<void> => {
    await expect(rowsOf(USER_A)).resolves.toEqual(snapshotOfA);
  };

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    app = await createHttpApp(AppModule);
    await app.listen(0);
    prisma = app.get(PrismaService);
    webOrigin = resolveWebOrigin(app.get(ConfigService));

    contract = await generateOpenApiDocument();
    await removeFixtures();

    const b = await buildWorld(USER_B, 'Bee', '1500');

    baseline = new Map();
    for (const [operation, probe] of reads()) {
      const response = await send(USER_B, probe.call());
      expect(response.status).toBe(200);
      baseline.set(operation, JSON.stringify(response.body));
    }

    const a = await buildWorld(USER_A, A_MARK, A_AMOUNT);
    worlds = { a, b };
    snapshotOfA = await rowsOf(USER_A);
  });

  afterAll(async () => {
    if (prisma) {
      await removeFixtures();
    }
    if (app) {
      await app.close();
    }
    if (originalJwtKey === undefined) {
      delete process.env.CLERK_JWT_KEY;
    } else {
      process.env.CLERK_JWT_KEY = originalJwtKey;
    }
  });

  it('holds a probe for every operation the contract publishes behind the guard', () => {
    expect(Object.keys(PROBES).sort()).toEqual(nonPublicOperations(contract).sort());

    const empty = Object.entries(PROBES)
      .filter(([, probes]) => probes.length === 0)
      .map(([operation]) => operation);

    expect(empty).toEqual([]);
  });

  it('aims every probe at the operation it is filed under, and every path id at the victim', () => {
    const misfiled = entries()
      .filter(([operation, probe]) => !reaches(operation, targetOf(probe)))
      .map(([operation, probe]) => `${operation} <- ${spelled(targetOf(probe))}`);

    const unaimed = Object.entries(PROBES)
      .filter(([operation]) => operation.includes('{'))
      .filter(([, probes]) => !probes.some((probe) => probe.kind === 'path'))
      .map(([operation]) => operation);

    expect(misfiled).toEqual([]);
    expect(unaimed).toEqual([]);
  });

  it('names one of the victim ids in every probe meant to aim at the victim', () => {
    const victimIds = [...idsOf(worlds.a), worlds.a.payee];

    const blind = [
      ...refusals()
        .filter(([, probe]) => {
          const id = foreignIdOf(probe);
          const call = probe.foreign(worlds.a, worlds.b);

          return id === NEVER_ISSUED || (probe.kind === 'path' && !call.path.includes(id));
        })
        .map(
          ([operation, probe]) => `${operation} <- ${spelled(probe.foreign(worlds.a, worlds.b))}`,
        ),
      ...entries()
        .filter(([, probe]) => probe.kind === 'query')
        .filter(([, probe]) => {
          if (probe.kind !== 'query') {
            return false;
          }
          const aimed = decodeURIComponent(probe.foreign(worlds.a).path);
          const absent = decodeURIComponent(probe.foreign(absentWorld()).path);

          return !victimIds.some((id) => aimed.includes(id) && !absent.includes(id));
        })
        .map(([operation]) => operation),
    ];

    expect(blind).toEqual([]);
  });

  it('holds a body or query probe wherever the contract takes an id in the body or the query', () => {
    const unprobed = [...idCarriers(contract)].flatMap(([operation, kinds]) =>
      [...kinds]
        .filter((kind) => !(PROBES[operation] ?? []).some((probe) => probe.kind === kind))
        .map((kind) => `${operation} has no ${kind} probe`),
    );

    expect(unprobed).toEqual([]);
  });

  it('gives the victim a row of every scoped model, so an unchanged snapshot means something', () => {
    const missing = Object.entries(snapshotOfA)
      .filter(([, rows]) => rows.length === 0)
      .map(([model]) => model);

    expect(missing).toEqual([]);
  });

  it('answers every read exactly as it did before the other tenant existed', async () => {
    const seen: Record<string, unknown>[] = [];
    for (const [operation, probe] of reads()) {
      const response = await send(USER_B, probe.call());
      const text = JSON.stringify(response.body);

      seen.push({
        operation,
        status: response.status,
        unchanged: text === baseline.get(operation),
        leaked: text.includes(A_MARK) || text.includes(A_AMOUNT),
      });
    }

    expect(seen).toEqual(
      reads().map(([operation]) => ({ operation, status: 200, unchanged: true, leaked: false })),
    );
  });

  it('finds nothing of the other tenant through a filter, and the caller own rows through the same one', async () => {
    const seen: Record<string, unknown>[] = [];
    for (const probe of queries()) {
      const foreign = await send(USER_B, probe.foreign(worlds.a));
      const own = await send(USER_B, probe.own(worlds.b));
      const ownRows = asRecord(own.body)['transactions'];

      seen.push({
        label: probe.foreign(worlds.a).path,
        foreign: { status: foreign.status, body: asRecord(foreign.body) },
        own: { status: own.status, found: Array.isArray(ownRows) && ownRows.length > 0 },
      });
    }

    expect(seen).toEqual(
      queries().map((probe) => ({
        label: probe.foreign(worlds.a).path,
        foreign: { status: 200, body: { transactions: [], days: [], nextCursor: null } },
        own: { status: 200, found: true },
      })),
    );

    await expectAUntouched();
  });

  it('refuses every write aimed at the other tenant by its own reason, the same as for an id never issued', async () => {
    const repeatable = refusals().filter(([operation]) => !ONE_OFF.has(operation));
    const seen: Record<string, unknown>[] = [];

    for (const [operation, probe] of repeatable) {
      const foreign = await send(USER_B, probe.foreign(worlds.a, worlds.b));
      const absent = await send(USER_B, probe.foreign(absentWorld(), worlds.b));
      const foreignBody = asRecord(foreign.body);
      const absentBody = asRecord(absent.body);

      seen.push({
        label: `${operation} (${probe.kind}, ${probe.reason})`,
        status: foreign.status,
        reason: foreignBody['reason'],
        sameAsNeverIssued:
          absent.status === foreign.status &&
          absentBody['reason'] === foreignBody['reason'] &&
          withoutId(absentBody['message'], NEVER_ISSUED) ===
            withoutId(foreignBody['message'], foreignIdOf(probe)),
      });

      await expectAUntouched();
    }

    expect(seen).toEqual(
      repeatable.map(([operation, probe]) => ({
        label: `${operation} (${probe.kind}, ${probe.reason})`,
        status: probe.status,
        reason: probe.reason,
        sameAsNeverIssued: true,
      })),
    );
  });

  it('lets the caller do the same with their own ids, so each refusal is about ownership', async () => {
    const repeatable = refusals().filter(([operation]) => !ONE_OFF.has(operation));
    const failed: Record<string, unknown>[] = [];

    for (const [operation, probe] of repeatable) {
      const response = await send(USER_B, await probe.own(worlds.b));

      if (![200, 201].includes(response.status)) {
        failed.push({ label: `${operation} (${probe.kind})`, body: response.body });
      }
    }

    expect(failed).toEqual([]);

    await expectAUntouched();
  });

  it('lets the caller write what names no id at all, and leaves the other tenant as it was', async () => {
    const failed: Record<string, unknown>[] = [];

    for (const [operation, probe] of writes()) {
      if (ONE_OFF.has(operation)) {
        continue;
      }

      const response = await send(USER_B, probe.call());

      if (![200, 201].includes(response.status)) {
        failed.push({ operation, body: response.body });
      }
    }

    expect(failed).toEqual([]);

    await expectAUntouched();
  });

  it('answers a path id of the caller own inactive budget like one of another tenant', async () => {
    const other = idOf(
      await ok(
        USER_B,
        post('/budgets', {
          language: 'ru',
          name: fresh('B second'),
          currency: 'PLN',
          timezone: ZONE,
          withDefaultCategories: false,
        }),
      ),
    );
    const parked = idOf(
      await ok(
        USER_B,
        post('/accounts', { name: fresh('parked'), type: 'CASH', initialBalance: '0' }),
      ),
    );
    await ok(USER_B, post(`/budgets/${worlds.b.budget}/activate`));

    const response = await send(USER_B, patch(`/accounts/${parked}`, { name: fresh('B') }));

    expect(other).not.toBe(worlds.b.budget);
    expect(response.status).toBe(404);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');
  });

  it('refuses a template from the other tenant and starts one from the caller own budget', async () => {
    const probe = refusalOf('POST /budgets');

    const foreign = await send(USER_B, probe.foreign(worlds.a, worlds.b));
    const absent = await send(USER_B, probe.foreign(absentWorld(), worlds.b));
    const own = await send(USER_B, await probe.own(worlds.b));
    await ok(USER_B, post(`/budgets/${worlds.b.budget}/activate`));

    expect(foreign.status).toBe(400);
    expect(asRecord(foreign.body)['reason']).toBe('UNKNOWN_BUDGET');
    expect(absent.status).toBe(400);
    expect(asRecord(absent.body)).toEqual(asRecord(foreign.body));
    expect(own.status).toBe(201);
    await expectAUntouched();
  });

  it('never answers the other tenant ids with a server error when the caller has no budget', async () => {
    const failed: Record<string, unknown>[] = [];

    for (const [operation, probe] of refusals()) {
      const response = await send(USER_C, probe.foreign(worlds.a, absentWorld()));
      const reason = asRecord(response.body)['reason'];

      if (response.status >= 500 || (reason !== 'NO_ACTIVE_BUDGET' && reason !== probe.reason)) {
        failed.push({ label: `${operation} (${probe.kind})`, status: response.status, reason });
      }
    }

    expect(failed).toEqual([]);
    await expectAUntouched();
  });

  it('answers a key the other tenant already used as a new request of the caller', async () => {
    const taken = await prisma.idempotencyKey.findFirst({ where: { userId: USER_A } });
    if (taken === null) {
      throw new Error('The victim holds no idempotency key');
    }

    const response = await send(USER_B, {
      method: 'POST',
      path: '/accounts',
      body: {
        idempotencyKey: taken.key,
        name: `${A_MARK} wallet`,
        type: 'CASH',
        initialBalance: A_AMOUNT,
      },
    });

    expect(response.status).toBe(201);
    const created = idOf(response.body);
    expect(created).not.toBe(worlds.a.account);
    await expect(prisma.account.findUnique({ where: { id: created } })).resolves.toMatchObject({
      userId: USER_B,
      budgetId: worlds.b.budget,
    });
    await expectAUntouched();
  });

  it('erases the caller and nothing of the other tenant', async () => {
    const probe = writeOf('POST /me/erase');

    const response = await send(USER_B, probe.call());

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    await expect(prisma.account.count({ where: { userId: USER_B } })).resolves.toBe(0);
    await expectAUntouched();
  });
});
