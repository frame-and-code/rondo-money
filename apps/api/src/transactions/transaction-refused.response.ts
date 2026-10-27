import { ApiProperty } from '@nestjs/swagger';
import { TRANSACTION_REFUSALS, type TransactionRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';
import { NotFoundResponse } from '@/openapi/not-found.response';

export class TransactionRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the record was refused, for a screen that answers each refusal differently rather ' +
      'than by reading the message. It is absent when the body itself was refused, because ' +
      'the pipe answers before the domain has a reason to give.',
    enum: TRANSACTION_REFUSALS,
    enumName: 'TransactionRefusal',
    required: false,
  })
  reason?: TransactionRefusal;
}

export class TransactionNotFoundResponse extends NotFoundResponse {
  @ApiProperty({
    description:
      'Why nothing was found: the path names a record the active budget does not hold. Another ' +
      'tenant holding it and nobody holding it answer the same.',
    enum: TRANSACTION_REFUSALS,
    enumName: 'TransactionRefusal',
  })
  reason!: TransactionRefusal;
}
