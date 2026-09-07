import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { ROUTING_OPTIONS } from '@/routing';

describe('routing (integration)', () => {
  let app: INestApplication | undefined;

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('starts, so no two handlers of this app claim one method and path', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(ROUTING_OPTIONS);

    await expect(app.init()).resolves.toBe(app);
  });
});
