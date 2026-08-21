import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse } from '@nestjs/swagger';

import { Public } from '@/auth/public.decorator';
import { HealthResponse } from '@/health/health.response';
import { DatabaseProbe } from '@/raw-sql/database-probe';

@Controller('health')
export class HealthController {
  constructor(private readonly probe: DatabaseProbe) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Liveness and database reachability',
    description: 'Open to anonymous callers: the deployment platform probes it without a token.',
  })
  @ApiOkResponse({ description: 'The database answered.', type: HealthResponse })
  @ApiServiceUnavailableResponse({
    description: 'The database did not answer.',
    type: HealthResponse,
  })
  async check(): Promise<HealthResponse> {
    try {
      await this.probe.ping();
    } catch {
      throw new ServiceUnavailableException({ status: 'error', info: { database: 'down' } });
    }
    return { status: 'ok', info: { database: 'up' } };
  }
}
