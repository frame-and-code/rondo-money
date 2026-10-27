import { Test } from '@nestjs/testing';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';
import { RequestContextService } from '@/request-context/request-context.service';

describe('ScopedRawRepository with no caller', () => {
  const queryRaw = jest.fn();
  let raw: ScopedRawRepository;
  let context: RequestContextService;

  beforeEach(async () => {
    queryRaw.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScopedRawRepository,
        RequestContextService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    raw = moduleRef.get(ScopedRawRepository);
    context = moduleRef.get(RequestContextService);
  });

  it('refuses a read issued outside any request, before a statement is built', async () => {
    const build = jest.fn(() => Prisma.sql`SELECT 1`);

    await expect(raw.query(build)).rejects.toThrow(/not scoped to a user/);
    expect(build).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a read inside a request that carries no identity', async () => {
    const build = jest.fn(() => Prisma.sql`SELECT 1`);

    await context.run(async () => {
      await expect(raw.query(build)).rejects.toThrow(/not scoped to a user/);
    });
    expect(build).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
