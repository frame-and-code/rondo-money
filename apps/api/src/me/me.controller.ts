import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { CurrentUserResponse } from '@/me/current-user.response';
import { EraseMeDto } from '@/me/erase-me.dto';
import { ErasedUserResponse } from '@/me/erased-user.response';
import { MeService } from '@/me/me.service';
import { ConflictResponse } from '@/mutations/conflict.response';
import { BadRequestResponse } from '@/openapi/bad-request.response';

const UNAUTHORIZED = 'The token was missing, malformed, expired or not minted for this app.';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOperation({
    summary: 'The authenticated caller',
    description: 'Requires a valid Clerk session token; reads no data and touches no table.',
  })
  @ApiOkResponse({ description: 'The token was valid.', type: CurrentUserResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  identify(@CurrentUserId() userId: string): CurrentUserResponse {
    return { userId };
  }

  @Post('erase')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Erase everything the caller owns',
    description:
      'Deletes every row belonging to the caller in one database transaction: budgets, ' +
      'accounts, records, envelopes, goals and their own settings. It is physical deletion ' +
      'and there is nothing to undo it with. The account itself is untouched, because this ' +
      'API holds no credential that could reach the identity provider; a client that wants ' +
      'the account gone deletes it with the session it already has. It is a POST because the ' +
      'idempotency key travels in the body.',
  })
  @ApiOkResponse({ description: 'The caller whose data is now gone.', type: ErasedUserResponse })
  @ApiBadRequestResponse({ description: 'The body was refused.', type: BadRequestResponse })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  erase(@CurrentUserId() userId: string, @Body() body: EraseMeDto): Promise<ErasedUserResponse> {
    return this.me.erase(userId, body);
  }
}
