import { ApiProperty } from '@nestjs/swagger';
import { TRANSFER_REFUSALS, type TransferRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';
import { NotFoundResponse } from '@/openapi/not-found.response';

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

export class TransferNotFoundResponse extends NotFoundResponse {
  @ApiProperty({
    description:
      'Why nothing was found: the path names a transfer the active budget does not hold. Another ' +
      'tenant holding it and nobody holding it answer the same.',
    enum: TRANSFER_REFUSALS,
    enumName: 'TransferRefusal',
  })
  reason!: TransferRefusal;
}
