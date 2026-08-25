import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { parseCalendarMonth } from '@rondo/types';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { BudgetViewQueryDto } from '@/budget-view/budget-view.dto';
import { BudgetViewResponse } from '@/budget-view/budget-view.response';
import { BudgetViewService } from '@/budget-view/budget-view.service';
import { BadRequestResponse } from '@/openapi/bad-request.response';

@Controller('budget-view')
export class BudgetViewController {
  constructor(private readonly view: BudgetViewService) {}

  @Get()
  @ApiOperation({
    summary: 'One month of the budget screen',
    description:
      'The groups and categories of the active budget with what each holds this month, plus ' +
      'the money that has no job yet. Nothing here is stored: every number is computed from ' +
      'transactions and assignments when it is asked for.',
  })
  @ApiOkResponse({ description: 'The month as it stands now.', type: BudgetViewResponse })
  @ApiBadRequestResponse({
    description: 'The month was refused, or the caller has no active budget to read.',
    type: BadRequestResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  read(
    @CurrentUserId() userId: string,
    @Query() query: BudgetViewQueryDto,
  ): Promise<BudgetViewResponse> {
    return this.view.read(userId, parseCalendarMonth(query.month));
  }
}
