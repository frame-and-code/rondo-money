import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '@/auth/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';

interface HealthResponse {
  status: 'ok';
  info: { database: 'up' };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + DB reachability: a trivial round-trip to Postgres. 200 up, 503 down.
   *
   * Public because the platform's probe is anonymous: Railway's healthcheck sends no token
   * and accepts nothing but 2xx, so behind the global guard every deploy would fail its
   * healthcheck and roll back.
   */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', info: { database: 'down' } });
    }
    return { status: 'ok', info: { database: 'up' } };
  }
}
