import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { ActivateBudgetDto } from '@/budgets/activate-budget.dto';
import { BudgetNotFoundResponse, BudgetRefusedResponse } from '@/budgets/budget-refused.response';
import { BudgetResponse } from '@/budgets/budget.response';
import { BudgetsService } from '@/budgets/budgets.service';
import { CreateBudgetDto } from '@/budgets/create-budget.dto';
import { RenameBudgetDto } from '@/budgets/rename-budget.dto';
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
      'one active budget, so a previous one stops being active here. Given a budget to start ' +
      'from, the same transaction copies its groups, categories, open accounts, assets and ' +
      'liabilities, each account opening at zero, and leaves every record behind.',
  })
  @ApiCreatedResponse({ description: 'The budget that now exists.', type: BudgetResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, the caller holds no budget to start from under that id, the ' +
      'starter set was asked for together with one, or the caller already has a budget under ' +
      'that name, whatever its case.',
    type: BudgetRefusedResponse,
  })
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

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a budget',
    description:
      'Changes what the budget is called and nothing else, whether or not it is the active ' +
      'one. The currency and the timezone are chosen when the budget is created and no ' +
      'operation accepts either afterwards.',
  })
  @ApiOkResponse({ description: 'The budget as it stands now.', type: BudgetResponse })
  @ApiBadRequestResponse({
    description:
      'The body was refused, or the caller already has another budget under that name, ' +
      'whatever its case.',
    type: BudgetRefusedResponse,
  })
  @ApiNotFoundResponse({
    description: 'The caller holds no such budget.',
    type: BudgetNotFoundResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameBudgetDto,
  ): Promise<BudgetResponse> {
    return this.budgets.rename(id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make a budget the active one',
    description:
      'Takes the active mark off the budget that carried it and puts it on this one, in one ' +
      'database transaction, so the caller never holds two active budgets or none. Every ' +
      'read that belongs to a budget answers for this one from the next request on. A budget ' +
      'that is active already is answered as it stands.',
  })
  @ApiOkResponse({ description: 'The budget that is active now.', type: BudgetResponse })
  @ApiBadRequestResponse({
    description: 'The body was refused.',
    type: BudgetRefusedResponse,
  })
  @ApiNotFoundResponse({
    description: 'The caller holds no such budget.',
    type: BudgetNotFoundResponse,
  })
  @ApiConflictResponse({
    description: 'The idempotency key was claimed by a different request.',
    type: ConflictResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActivateBudgetDto,
  ): Promise<BudgetResponse> {
    return this.budgets.activate(id, body.idempotencyKey);
  }
}
