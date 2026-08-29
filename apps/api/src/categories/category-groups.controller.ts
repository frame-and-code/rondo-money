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
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import {
  CreateCategoryGroupDto,
  IdempotentDto,
  ReorderCategoryGroupsDto,
  UpdateCategoryGroupDto,
} from '@/categories/categories.dto';
import { CategoryGroupsService } from '@/categories/category-groups.service';
import { CategoryRefusedResponse } from '@/categories/category-refused.response';
import { CategoryGroupResponse } from '@/categories/category.response';
import { ConflictResponse } from '@/mutations/conflict.response';

const REFUSED = {
  description:
    'The body was refused, or the change names something the caller cannot reach. A refusal ' +
    'from the domain carries the reason it was refused for.',
  type: CategoryRefusedResponse,
};

const CLAIMED = {
  description: 'The idempotency key was claimed by a different request.',
  type: ConflictResponse,
};

const ANONYMOUS = {
  description: 'The token was missing, malformed, expired or not minted for this app.',
  type: UnauthorizedResponse,
};

@Controller('category-groups')
export class CategoryGroupsController {
  constructor(private readonly groups: CategoryGroupsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a category group',
    description: 'Adds an empty group at the end of the active budget.',
  })
  @ApiCreatedResponse({ description: 'The group that was created.', type: CategoryGroupResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateCategoryGroupDto,
  ): Promise<CategoryGroupResponse> {
    return this.groups.create(userId, body);
  }

  @Post('reorder')
  @ApiOperation({
    summary: 'Rewrite the order of the groups',
    description:
      'Takes the groups of the budget in the order the user left them, on the same terms as ' +
      'the categories of a group: fewer than the budget holds is allowed, and the rest keep ' +
      'their order behind the named ones.',
  })
  @ApiCreatedResponse({
    description: 'The groups in their new order.',
    type: [CategoryGroupResponse],
  })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  reorder(
    @CurrentUserId() userId: string,
    @Body() body: ReorderCategoryGroupsDto,
  ): Promise<CategoryGroupResponse[]> {
    return this.groups.reorder(userId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a group' })
  @ApiOkResponse({ description: 'The group as it stands now.', type: CategoryGroupResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  update(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryGroupDto,
  ): Promise<CategoryGroupResponse> {
    return this.groups.update(userId, id, body);
  }

  @Post(':id/hide')
  @ApiOperation({
    summary: 'Hide a group with everything in it',
    description:
      'Marks the group and each of its categories hidden in one transaction. A category is ' +
      'never left without a group, so the two cannot be hidden apart. It is refused unless ' +
      'every category of the group holds nothing over every month, the already hidden ones ' +
      'included.',
  })
  @ApiCreatedResponse({ description: 'The group, now hidden.', type: CategoryGroupResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  hide(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdempotentDto,
  ): Promise<CategoryGroupResponse> {
    return this.groups.hide(userId, id, body.idempotencyKey);
  }

  @Post(':id/unhide')
  @ApiOperation({
    summary: 'Bring a hidden group back',
    description: 'Takes the marker off the group and off the categories it was put on with.',
  })
  @ApiCreatedResponse({ description: 'The group, visible again.', type: CategoryGroupResponse })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  unhide(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdempotentDto,
  ): Promise<CategoryGroupResponse> {
    return this.groups.unhide(userId, id, body.idempotencyKey);
  }
}
