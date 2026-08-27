import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { CreateMoveDto } from '@/moves/create-move.dto';
import { MoveRefusedResponse } from '@/moves/move-refused.response';
import { MoveResponse } from '@/moves/move.response';
import { MovesService } from '@/moves/moves.service';
import { ConflictResponse } from '@/mutations/conflict.response';

@Controller('moves')
export class MovesController {
  constructor(private readonly moves: MovesService) {}

  @Post()
  @ApiOperation({
    summary: 'Move money between two envelopes',
    description:
      'Moves an amount out of one envelope and into another for one month, where ready to ' +
      'assign is an envelope too. Assigning money is this same operation with ready to assign ' +
      'as the source, so there is no separate way to set what a category holds.',
  })
  @ApiCreatedResponse({ description: 'The move that was applied.', type: MoveResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or a side names an envelope the caller cannot move. A refusal ' +
      'from the domain carries the reason it was refused for.',
    type: MoveRefusedResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  move(@CurrentUserId() userId: string, @Body() body: CreateMoveDto): Promise<MoveResponse> {
    return this.moves.move(userId, body);
  }
}
