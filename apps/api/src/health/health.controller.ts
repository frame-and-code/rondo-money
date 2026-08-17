import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '@/auth/public.decorator';
import { DatabaseProbe } from '@/raw-sql/database-probe';

interface HealthResponse {
  status: 'ok';
  info: { database: 'up' };
}

@Controller('health')
export class HealthController {
  constructor(private readonly probe: DatabaseProbe) {}

  /**
   * Liveness + DB reachability: a trivial round-trip to Postgres. 200 up, 503 down.
   *
   * Public because the platform's probe is anonymous: Railway's healthcheck sends no token
   * and accepts nothing but 2xx, so behind the global guard every deploy would fail its
   * healthcheck and roll back. That also means it has no user to scope by, which is why the
   * query lives in `DatabaseProbe` rather than being written here (ADR-005).
   */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.probe.ping();
    } catch {
      throw new ServiceUnavailableException({ status: 'error', info: { database: 'down' } });
    }
    return { status: 'ok', info: { database: 'up' } };
  }
}
