import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { CategoryPaidMonthDto } from '@/categories/category-paid.dto';
import { CategoryPaidMonthResponse } from '@/categories/category-paid.response';
import { CategoryPaidService } from '@/categories/category-paid.service';
import { ANONYMOUS, CLAIMED, REFUSED } from '@/categories/category-responses';

@Controller('categories')
export class CategoryPaidController {
  constructor(private readonly paid: CategoryPaidService) {}

  @Post(':id/paid')
  @ApiOperation({
    summary: 'Mark a category paid for one month',
    description:
      'Puts a mark on the pair of category and month saying the payment the category stands ' +
      'for is done. The mark is a state the user sets rather than a number the app derives, ' +
      'and it changes no amount. The next month starts without one. Marking a category that ' +
      'already carries the mark leaves it as it is.',
  })
  @ApiCreatedResponse({
    description: 'The mark as it stands now.',
    type: CategoryPaidMonthResponse,
  })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  mark(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CategoryPaidMonthDto,
  ): Promise<CategoryPaidMonthResponse> {
    return this.paid.mark(userId, id, body);
  }

  @Post(':id/unpaid')
  @ApiOperation({
    summary: 'Take the paid mark off a category for one month',
    description:
      'Removes the mark from the pair of category and month. A category carrying none is left ' +
      'as it is.',
  })
  @ApiCreatedResponse({
    description: 'The mark as it stands now.',
    type: CategoryPaidMonthResponse,
  })
  @ApiBadRequestResponse(REFUSED)
  @ApiConflictResponse(CLAIMED)
  @ApiUnauthorizedResponse(ANONYMOUS)
  unmark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CategoryPaidMonthDto,
  ): Promise<CategoryPaidMonthResponse> {
    return this.paid.unmark(id, body);
  }
}
