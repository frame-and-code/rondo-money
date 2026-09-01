import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { ConflictResponse } from '@/mutations/conflict.response';
import { CreateTransactionDto } from '@/transactions/create-transaction.dto';
import { DeleteTransactionDto } from '@/transactions/delete-transaction.dto';
import { ListTransactionsQueryDto } from '@/transactions/list-transactions.query.dto';
import { TransactionRefusedResponse } from '@/transactions/transaction-refused.response';
import { TransactionResponse } from '@/transactions/transaction.response';
import { PayeesResponse, TransactionPageResponse } from '@/transactions/transactions.response';
import { TransactionsService } from '@/transactions/transactions.service';
import { UpdateTransactionDto } from '@/transactions/update-transaction.dto';

const REFUSED =
  'The body was refused, or the record cannot be written where it was aimed. A refusal from ' +
  'the domain carries the reason it was refused for.';

const UNAUTHORIZED = 'The token was missing, malformed, expired or not minted for this app.';

const REPEATED = 'The idempotency key was claimed by a different request.';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Record an income or an expense',
    description:
      'Writes one record in one database transaction. The amount arrives without a sign and ' +
      'the server writes one from the type, so an expense always leaves the account.',
  })
  @ApiCreatedResponse({ description: 'The record that now exists.', type: TransactionResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransactionRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    return this.transactions.create(userId, body);
  }

  @Get()
  @ApiOperation({
    summary: 'The records of a budget, newest first',
    description:
      'One page of the feed, ordered by day and then by the moment each record was entered, ' +
      'with the total of every day it touches. Each total covers the whole day under the same ' +
      'filter, so a day split across two pages reads the same on both.',
  })
  @ApiOkResponse({
    description: 'The page and where to carry on from.',
    type: TransactionPageResponse,
  })
  @ApiBadRequestResponse({ description: REFUSED, type: TransactionRefusedResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  list(
    @CurrentUserId() userId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionPageResponse> {
    return this.transactions.list(userId, query);
  }

  @Get('payees')
  @ApiOperation({
    summary: 'The payees this budget has recorded',
    description:
      'Every name a person has typed, once each and in alphabetical order. The names the app ' +
      'wrote itself are not among them.',
  })
  @ApiOkResponse({
    description: 'The names, for a field to search in the browser.',
    type: PayeesResponse,
  })
  @ApiBadRequestResponse({ description: REFUSED, type: TransactionRefusedResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  payees(@CurrentUserId() userId: string): Promise<PayeesResponse> {
    return this.transactions.payees(userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a record',
    description:
      'Rewrites every field, the account and the type included, and runs the rules of the type ' +
      'it becomes. An opening balance takes a correction of its amount and refuses every other ' +
      'change. A transfer leg is not changed here at all: the pair it belongs to has its own ' +
      'operations under /transfers.',
  })
  @ApiOkResponse({ description: 'The record as it stands now.', type: TransactionResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransactionRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    return this.transactions.update(id, body);
  }

  @Post(':id/delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a record',
    description:
      'Deletes the row rather than marking it, and the balance, the activity and ready to ' +
      'assign follow at once. It is a POST because the idempotency key travels in the body.',
  })
  @ApiOkResponse({ description: 'The record that was removed.', type: TransactionResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransactionRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeleteTransactionDto,
  ): Promise<TransactionResponse> {
    return this.transactions.remove(id, body);
  }
}
