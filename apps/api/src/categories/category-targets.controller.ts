import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { IdempotentDto } from '@/categories/categories.dto';
import { ANONYMOUS, CLAIMED, REFUSED } from '@/categories/category-responses';
import { SetCategoryTargetDto } from '@/categories/category-target.dto';
import { CategoryTargetResponse } from '@/categories/category-target.response';
import { CategoryTargetsService } from '@/categories/category-targets.service';

@Controller('categories')
export class CategoryTargetsController {
  constructor(private readonly targets: CategoryTargetsService) {}

  @Post(':id/target')
  @ApiOperation({
    summary: 'Set the goal of a category',
    description:
      'Starts a goal, or edits the one the category is running. Changing the kind of a goal ' +
      'started in an earlier month closes that one and starts a new one, so the category ' +
      'keeps its history.',
  })
  @ApiCreatedResponse({ description: 'The goal as it stands now.', type: CategoryTargetResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  set(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetCategoryTargetDto,
  ): Promise<CategoryTargetResponse> {
    return this.targets.set(userId, id, body);
  }

  @Post(':id/target/close')
  @ApiOperation({
    summary: 'Close the goal of a category',
    description:
      'Marks the goal as ending with the month the budget is living in. It is still shown in ' +
      'that month and gone from the next one, and the row stays in the history.',
  })
  @ApiCreatedResponse({ description: 'The goal, now closed.', type: CategoryTargetResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdempotentDto,
  ): Promise<CategoryTargetResponse> {
    return this.targets.close(id, body.idempotencyKey);
  }
}
