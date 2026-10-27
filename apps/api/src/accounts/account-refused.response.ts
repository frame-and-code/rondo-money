import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_REFUSALS, type AccountRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';
import { NotFoundResponse } from '@/openapi/not-found.response';
import { ApiMoneyProperty } from '@/validation/money.decorator';

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

  @ApiMoneyProperty({
    required: false,
    description:
      'What the account still holds, present only when that is what blocked the archive, so a ' +
      'client that does not already carry the balance learns it from the refusal.',
  })
  balance?: string;
}

export class AccountNotFoundResponse extends NotFoundResponse {
  @ApiProperty({
    description:
      'Why nothing was found: the path names an account the active budget does not hold. Another ' +
      'tenant holding it and nobody holding it answer the same.',
    enum: ACCOUNT_REFUSALS,
    enumName: 'AccountRefusal',
  })
  reason!: AccountRefusal;
}
