import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
import { DeleteNetWorthItemDto } from '@/net-worth/delete-net-worth-item.dto';
import { NetWorthItemResponse, NetWorthItemsResponse } from '@/net-worth/net-worth-item.response';
import { NetWorthItemsService } from '@/net-worth/net-worth-items.service';
import { NetWorthRefusedResponse } from '@/net-worth/net-worth-refused.response';
import { WriteNetWorthItemDto } from '@/net-worth/write-net-worth-item.dto';

const UNAUTHORIZED = 'The token was missing, malformed, expired or not minted for this app.';

const CONFLICT = 'The idempotency key was claimed by a different request.';

@Controller('liabilities')
export class LiabilitiesController {
  constructor(private readonly items: NetWorthItemsService) {}

  @Post()
  @ApiOperation({
    summary: 'Write down a liability',
    description:
      'Something the user owes that sits on no account: a debt to a friend. No transaction is ' +
      'written for it and no balance moves.',
  })
  @ApiCreatedResponse({ description: 'The liability that now exists.', type: NetWorthItemResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or the day is after today, or the caller has no active budget.',
    type: NetWorthRefusedResponse,
  })
  @ApiConflictResponse({ description: CONFLICT, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  create(
    @CurrentUserId() userId: string,
    @Body() body: WriteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    return this.items.create('liability', userId, body);
  }

  @Get()
  @ApiOperation({
    summary: "The active budget's liabilities",
    description:
      'The liabilities of the budget the caller is working in, oldest first. No total is answered ' +
      'here, and none is stored.',
  })
  @ApiOkResponse({ description: 'The liabilities as they stand now.', type: NetWorthItemsResponse })
  @ApiBadRequestResponse({
    description: 'The caller has no active budget, so there is nothing to scope to.',
    type: NetWorthRefusedResponse,
  })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  list(): Promise<NetWorthItemsResponse> {
    return this.items.list('liability');
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a liability',
    description:
      'Replaces the name, the amount and the day together. The body is the whole record, so a ' +
      'body carrying no day takes the stored one off.',
  })
  @ApiOkResponse({ description: 'The liability as it stands now.', type: NetWorthItemResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or the day is after today, or this budget holds no such liability, ' +
      'or the caller has no active budget.',
    type: NetWorthRefusedResponse,
  })
  @ApiConflictResponse({ description: CONFLICT, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  change(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WriteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    return this.items.change('liability', id, body);
  }

  @Post(':id/delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a liability',
    description:
      'Removes the row for good. Nothing else refers to it, so nothing else moves. It is a ' +
      'POST rather than a DELETE because the idempotency key travels in the body.',
  })
  @ApiOkResponse({ description: 'The liability that was removed.', type: NetWorthItemResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or this budget holds no such liability, or the caller has no active ' +
      'budget.',
    type: NetWorthRefusedResponse,
  })
  @ApiConflictResponse({ description: CONFLICT, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeleteNetWorthItemDto,
  ): Promise<NetWorthItemResponse> {
    return this.items.remove('liability', id, body);
  }
}
