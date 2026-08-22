import { ApiProperty } from '@nestjs/swagger';

export class HealthInfo {
  @ApiProperty({
    enum: ['up', 'down'],
    description: 'Whether the round-trip to Postgres succeeded.',
  })
  database!: 'up' | 'down';
}

export class HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({ type: HealthInfo })
  info!: HealthInfo;
}
