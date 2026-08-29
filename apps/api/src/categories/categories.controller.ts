import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import {
  CreateCategoryDto,
  IdempotentDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from '@/categories/categories.dto';
import { CategoriesService } from '@/categories/categories.service';
import { ANONYMOUS, CLAIMED, REFUSED } from '@/categories/category-responses';
import { CategoryResponse } from '@/categories/category.response';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a category',
    description: 'Adds a category to a group of the active budget, at the end of that group.',
  })
  @ApiCreatedResponse({ description: 'The category that was created.', type: CategoryResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.create(userId, body);
  }

  @Post('reorder')
  @ApiOperation({
    summary: 'Rewrite the order of one group',
    description:
      'Takes the categories of the group in the order the user left them. The list may name ' +
      'fewer than the group holds, because the month it came from lists only what is visible ' +
      'in that month, and the rest keep their order behind the named ones. A duplicate or an ' +
      'id the group does not hold is refused.',
  })
  @ApiCreatedResponse({
    description: 'The categories in their new order.',
    type: [CategoryResponse],
  })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  reorder(@Body() body: ReorderCategoriesDto): Promise<CategoryResponse[]> {
    return this.categories.reorder(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a category, move it or change its look',
    description:
      'Every field is optional and only what is sent is written. Moving a category into a ' +
      'hidden group is refused: the money it holds would leave the screen with it.',
  })
  @ApiOkResponse({ description: 'The category as it stands now.', type: CategoryResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.update(id, body);
  }

  @Post(':id/hide')
  @ApiOperation({
    summary: 'Hide a category',
    description:
      'Marks the category hidden from this moment on, which takes it out of every month after ' +
      'that one and out of none before it. The row and its transactions are untouched, so its ' +
      'past activity keeps counting. A category holding money over any month is refused.',
  })
  @ApiCreatedResponse({ description: 'The category, now hidden.', type: CategoryResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdempotentDto,
  ): Promise<CategoryResponse> {
    return this.categories.hide(id, body.idempotencyKey);
  }

  @Post(':id/unhide')
  @ApiOperation({
    summary: 'Bring a hidden category back',
    description: 'Takes the hidden marker off, and the category is in every month again.',
  })
  @ApiCreatedResponse({ description: 'The category, visible again.', type: CategoryResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  unhide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdempotentDto,
  ): Promise<CategoryResponse> {
    return this.categories.unhide(id, body.idempotencyKey);
  }
}
