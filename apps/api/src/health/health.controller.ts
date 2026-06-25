import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

interface HealthResponse {
  status: 'ok';
  info: { database: 'up' };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + DB reachability: a trivial round-trip to Postgres. 200 up, 503 down. */
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
