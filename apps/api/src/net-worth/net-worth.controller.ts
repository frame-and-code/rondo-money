import { Controller, Get } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { NetWorthRefusedResponse } from '@/net-worth/net-worth-refused.response';
import { NetWorthResponse } from '@/net-worth/net-worth.response';
import { NetWorthService } from '@/net-worth/net-worth.service';

@Controller('net-worth')
export class NetWorthController {
  constructor(private readonly worth: NetWorthService) {}

  @Get()
  @ApiOperation({
    summary: 'What the caller is worth',
    description:
      'What the open accounts of the active budget hold, plus the assets the user wrote down, ' +
      'minus the liabilities, with the three lists the total is made of. One statement answers ' +
      'all of it, so the total and the rows describe the same moment. Nothing here is stored.',
  })
  @ApiOkResponse({ description: 'Net worth as it stands now.', type: NetWorthResponse })
  @ApiBadRequestResponse({
    description: 'The caller has no active budget, so there is nothing to scope to.',
    type: NetWorthRefusedResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  read(): Promise<NetWorthResponse> {
    return this.worth.read();
  }
}
