import { ApiProperty } from '@nestjs/swagger';
import { BUDGET_REFUSALS, type BudgetRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';

export class BudgetRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the budget operation was refused, for a screen that answers a refusal without ' +
      'reading the message. It is absent when the body itself was refused, because the pipe ' +
      'answers before the domain has a reason to give.',
    enum: BUDGET_REFUSALS,
    enumName: 'BudgetRefusal',
    required: false,
  })
  reason?: BudgetRefusal;
}
