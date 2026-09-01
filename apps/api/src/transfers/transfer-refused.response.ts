import { ApiProperty } from '@nestjs/swagger';
import { TRANSFER_REFUSALS, type TransferRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';

export class TransferRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the transfer was refused, for a screen that answers each refusal differently rather ' +
      'than by reading the message. It is absent when the body itself was refused, because ' +
      'the pipe answers before the domain has a reason to give.',
    enum: TRANSFER_REFUSALS,
    enumName: 'TransferRefusal',
    required: false,
  })
  reason?: TransferRefusal;
}
