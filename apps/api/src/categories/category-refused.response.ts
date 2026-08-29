import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY_REFUSALS, type CategoryRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export class CategoryRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the change was refused, for a screen that answers each refusal differently rather ' +
      'than by reading the message. It is absent when the body itself was refused, because ' +
      'the pipe answers before the domain has a reason to give.',
    enum: CATEGORY_REFUSALS,
    enumName: 'CategoryRefusal',
    required: false,
  })
  reason?: CategoryRefusal;

  @ApiMoneyProperty({
    required: false,
    description:
      'What the category still holds over every month, present only when that is what blocked ' +
      'the hide. The screen names this amount rather than the one the open month shows.',
  })
  available?: string;
}
