import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { CurrentUserResponse } from '@/me/current-user.response';

@Controller('me')
export class MeController {
  /**
   * Echoes back the caller the guard verified — the whole authenticated round-trip (token →
   * `ClerkAuthGuard` → request context → handler) with no domain model in the way.
   *
   * It exists because F1.4 has to prove a generated client can make an *authorized* call, and
   * until F1.6 every other endpoint is either public (the healthcheck) or absent. Touching no
   * table is the point, not a limitation: this is the one place where a failure can only be
   * the auth chain, never a query.
   */
  @Get()
  @ApiOperation({
    summary: 'The authenticated caller',
    description: 'Requires a valid Clerk session token; reads no data and touches no table.',
  })
  @ApiOkResponse({ description: 'The token was valid.', type: CurrentUserResponse })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  identify(@CurrentUserId() userId: string): CurrentUserResponse {
    return { userId };
  }
}
