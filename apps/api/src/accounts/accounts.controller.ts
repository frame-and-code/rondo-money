import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccountRefusedResponse } from '@/accounts/account-refused.response';
import { AccountResponse } from '@/accounts/account.response';
import { AccountsResponse } from '@/accounts/accounts.response';
import { AccountsService } from '@/accounts/accounts.service';
import { CorrectOpeningDto } from '@/accounts/correct-opening.dto';
import { CreateAccountDto } from '@/accounts/create-account.dto';
import { RenameAccountDto } from '@/accounts/rename-account.dto';
import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { ConflictResponse } from '@/mutations/conflict.response';
import { TransactionResponse } from '@/transactions/transaction.response';

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
    type: AccountRefusedResponse,
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
    summary: "The active budget's accounts and what they hold",
    description:
      'The accounts of the budget the caller is working in, oldest first, each with its ' +
      'balance, and what they hold together. Nothing here is stored: a balance is summed from ' +
      "the account's transactions when it is asked for. An archived account is in neither the " +
      'list nor the total.',
  })
  @ApiOkResponse({ description: 'The accounts as they stand now.', type: AccountsResponse })
  @ApiBadRequestResponse({
    description: 'The caller has no active budget, so there are no accounts to scope to.',
    type: AccountRefusedResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  list(@CurrentUserId() userId: string): Promise<AccountsResponse> {
    return this.accounts.list(userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename an account',
    description:
      'Changes what the account is called and nothing else. The type is chosen when the ' +
      'account is created and never afterwards, and the balance belongs to the transactions.',
  })
  @ApiOkResponse({ description: 'The account as it stands now.', type: AccountResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or this budget holds no such account, or the caller has no ' +
      'active budget.',
    type: AccountRefusedResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameAccountDto,
  ): Promise<AccountResponse> {
    return this.accounts.rename(id, body);
  }

  @Patch(':id/opening-balance')
  @ApiOperation({
    summary: 'Correct what an account opened with',
    description:
      'Changes the amount of the opening balance the account was created with, and nothing ' +
      'else about it. The day it carries and the direction it points in belong to the account ' +
      'rather than to this correction, so neither is accepted here. It is refused the moment ' +
      'the account holds a record of its own: from then on a balance that drifted is corrected ' +
      'by recording the movements it is missing, not by rewriting the day it was opened.',
  })
  @ApiOkResponse({
    description: 'The opening balance as it stands now.',
    type: TransactionResponse,
  })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or the account already holds records of its own, or this budget ' +
      'holds no such account.',
    type: AccountRefusedResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  correctOpening(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CorrectOpeningDto,
  ): Promise<TransactionResponse> {
    return this.accounts.correctOpening(id, body);
  }
}
