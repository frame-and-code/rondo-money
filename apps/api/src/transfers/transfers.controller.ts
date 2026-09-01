import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
import { CreateTransferDto } from '@/transfers/create-transfer.dto';
import { DeleteTransferDto } from '@/transfers/delete-transfer.dto';
import { TransferRefusedResponse } from '@/transfers/transfer-refused.response';
import { TransferResponse } from '@/transfers/transfer.response';
import { TransfersService } from '@/transfers/transfers.service';
import { UpdateTransferDto } from '@/transfers/update-transfer.dto';

const REFUSED =
  'The body was refused, or the pair cannot be written where it was aimed. A refusal from the ' +
  'domain carries the reason it was refused for.';

const UNAUTHORIZED = 'The token was missing, malformed, expired or not minted for this app.';

const REPEATED = 'The idempotency key was claimed by a different request.';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Move money between two accounts',
    description:
      'Writes both legs of one transfer in one database transaction: the amount leaves one ' +
      'account and arrives on the other, under a shared identifier. Neither envelope nor ' +
      'ready to assign is touched, because the money never leaves the budget.',
  })
  @ApiCreatedResponse({ description: 'The pair that now exists.', type: TransferResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransferRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateTransferDto,
  ): Promise<TransferResponse> {
    return this.transfers.create(userId, body);
  }

  @Patch(':transferId')
  @ApiOperation({
    summary: 'Change a transfer',
    description:
      'Rewrites both legs together, the two accounts included, so the pair can never disagree ' +
      'about the amount, the day or where the money went.',
  })
  @ApiOkResponse({ description: 'The pair as it stands now.', type: TransferResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransferRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  update(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @Body() body: UpdateTransferDto,
  ): Promise<TransferResponse> {
    return this.transfers.update(transferId, body);
  }

  @Post(':transferId/delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a transfer',
    description:
      'Deletes both legs together, and both balances follow at once. It is a POST because the ' +
      'idempotency key travels in the body.',
  })
  @ApiOkResponse({ description: 'The pair that was removed.', type: TransferResponse })
  @ApiBadRequestResponse({ description: REFUSED, type: TransferRefusedResponse })
  @ApiConflictResponse({ description: REPEATED, type: ConflictResponse })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED, type: UnauthorizedResponse })
  remove(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @Body() body: DeleteTransferDto,
  ): Promise<TransferResponse> {
    return this.transfers.remove(transferId, body);
  }
}
