import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { ROUTE_CONFLICT_POLICY } from '@/route-conflicts';

@Controller('probe')
class ShadowedProbeController {
  @Get(':id')
  byId(): string {
    return 'by id';
  }

  @Get('me')
  me(): string {
    return 'me';
  }
}

describe('route conflicts (integration)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('starts, so no route this app serves shadows another', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ routeConflictPolicy: ROUTE_CONFLICT_POLICY });

    await expect(app.init()).resolves.toBe(app);
  });

  it('refuses to start when a literal path is declared after the parameter that swallows it', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ShadowedProbeController],
    }).compile();

    const shadowed = moduleRef.createNestApplication({
      routeConflictPolicy: ROUTE_CONFLICT_POLICY,
    });

    await expect(shadowed.init()).rejects.toThrow('GET /probe/me');
    await shadowed.close();
  });
});
