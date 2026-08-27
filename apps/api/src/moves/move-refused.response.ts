import { ApiProperty } from '@nestjs/swagger';
import { MOVE_REFUSALS, type MoveRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';

export class MoveRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the move was refused, for a screen that answers each refusal differently rather ' +
      'than by reading the message. It is absent when the body itself was refused, because ' +
      'the pipe answers before the domain has a reason to give.',
    enum: MOVE_REFUSALS,
    enumName: 'MoveRefusal',
    required: false,
  })
  reason?: MoveRefusal;
}
