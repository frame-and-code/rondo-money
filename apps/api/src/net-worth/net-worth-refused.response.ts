import { ApiProperty } from '@nestjs/swagger';
import { NET_WORTH_REFUSALS, type NetWorthRefusal } from '@rondo/types';

import { BadRequestResponse } from '@/openapi/bad-request.response';

export class NetWorthRefusedResponse extends BadRequestResponse {
  @ApiProperty({
    description:
      'Why the operation was refused, for a screen that answers each refusal differently ' +
      'rather than by reading the message. It is absent when the body itself was refused, ' +
      'because the pipe answers before the domain has a reason to give.',
    enum: NET_WORTH_REFUSALS,
    enumName: 'NetWorthRefusal',
    required: false,
  })
  reason?: NetWorthRefusal;
}
