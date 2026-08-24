import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccountResponse } from '@/accounts/account.response';
import { AccountsService } from '@/accounts/accounts.service';
import { CreateAccountDto } from '@/accounts/create-account.dto';
import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { ConflictResponse } from '@/mutations/conflict.response';
import { BadRequestResponse } from '@/openapi/bad-request.response';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates the account and its opening balance in one database transaction. The balance ' +
      'is an income transaction dated today in the budget timezone, carrying no category, so ' +
      'the money lands in Ready to Assign. It is written even when the balance is zero.',
  })
  @ApiCreatedResponse({ description: 'The account that now exists.', type: AccountResponse })
  @ApiBadRequestResponse({
    description: 'The body was refused, or the caller has no active budget to add it to.',
    type: BadRequestResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateAccountDto,
  ): Promise<AccountResponse> {
    return this.accounts.create(userId, body);
  }

  @Get()
  @ApiOperation({
    summary: "The active budget's accounts",
    description:
      'The accounts of the budget the caller is working in, oldest first. Balances are not ' +
      'here: they are computed from transactions rather than stored.',
  })
  @ApiOkResponse({ description: 'The accounts that exist now.', type: [AccountResponse] })
  @ApiBadRequestResponse({
    description: 'The caller has no active budget, so there are no accounts to scope to.',
    type: BadRequestResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  list(@CurrentUserId() userId: string): Promise<AccountResponse[]> {
    return this.accounts.list(userId);
  }
}
