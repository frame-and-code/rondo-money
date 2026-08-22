import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { CurrentUserResponse } from '@/me/current-user.response';

@Controller('me')
export class MeController {
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
