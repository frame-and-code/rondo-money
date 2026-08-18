import { ApiProperty } from '@nestjs/swagger';

/** What the healthcheck probed, and what it found. */
export class HealthInfo {
  @ApiProperty({
    enum: ['up', 'down'],
    description: 'Whether the round-trip to Postgres succeeded.',
  })
  database!: 'up' | 'down';
}

/**
 * The healthcheck body, for both answers: 200 reports `ok`/`up`, 503 reports `error`/`down`.
 *
 * A class rather than the interface this used to be, because the OpenAPI document is built
 * from decorator metadata — an interface leaves no trace after compilation, and the spec (and
 * with it every generated client) would describe a response with no shape at all.
 *
 * That the two fields move together is not expressed in the schema; it is not worth two more
 * response classes on the one endpoint nobody generates a client for.
 */
export class HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({ type: HealthInfo })
  info!: HealthInfo;
}
