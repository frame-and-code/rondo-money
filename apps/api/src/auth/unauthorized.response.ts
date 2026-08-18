import { ApiProperty } from '@nestjs/swagger';

/**
 * The body every rejected request gets — the shape Nest's `UnauthorizedException` produces,
 * written down so the contract carries it.
 *
 * Without this the spec documents a 401 with no schema at all, and every generated client
 * types the error as `unknown`: a screen that wants to tell an expired session apart from a
 * network failure has nothing to read. That is the trap the spec rule warns about, and the
 * guard is the one place in this app that produces the shape often enough to fix it once.
 *
 * The message is deliberately vague at the source (`Invalid session token` for anything
 * malformed, expired or forged) — the reason stays in the log, so this documents that too.
 */
export class UnauthorizedResponse {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;

  @ApiProperty({ example: 'Invalid session token' })
  message!: string;
}
