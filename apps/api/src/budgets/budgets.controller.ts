import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { BudgetResponse } from '@/budgets/budget.response';
import { BudgetsService } from '@/budgets/budgets.service';
import { CreateBudgetDto } from '@/budgets/create-budget.dto';
import { ConflictResponse } from '@/mutations/conflict.response';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a budget',
    description:
      'Creates the budget and, when asked for, the starter groups and categories, in one ' +
      "database transaction. The chosen language is stored in the caller's settings by the " +
      'same transaction, because the category names are written in it. A user holds at most ' +
      'one active budget, so a previous one stops being active here.',
  })
  @ApiCreatedResponse({ description: 'The budget that now exists.', type: BudgetResponse })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  create(@CurrentUserId() userId: string, @Body() body: CreateBudgetDto): Promise<BudgetResponse> {
    return this.budgets.create(userId, body);
  }

  @Get()
  @ApiOperation({
    summary: "The caller's budgets",
    description:
      'Every budget the caller owns, oldest first, with the active one marked. A caller part ' +
      'way through onboarding has none, which is an empty list rather than an error.',
  })
  @ApiOkResponse({ description: 'The budgets that exist now.', type: [BudgetResponse] })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  list(@CurrentUserId() userId: string): Promise<BudgetResponse[]> {
    return this.budgets.list(userId);
  }
}
