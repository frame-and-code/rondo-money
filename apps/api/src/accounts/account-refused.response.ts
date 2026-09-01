import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_REFUSALS, type AccountRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';

export class AccountRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the account operation was refused, for a screen that answers each refusal ' +
      'differently rather than by reading the message. It is absent when the body itself was ' +
      'refused, because the pipe answers before the domain has a reason to give.',
    enum: ACCOUNT_REFUSALS,
    enumName: 'AccountRefusal',
    required: false,
  })
  reason?: AccountRefusal;
}
