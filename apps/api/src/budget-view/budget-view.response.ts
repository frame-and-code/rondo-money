import { ApiProperty } from '@nestjs/swagger';
import {
  type BudgetViewCategoryDto,
  type BudgetViewDto,
  type BudgetViewGroupDto,
  type CalendarMonth,
} from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class BudgetViewCategoryResponse implements BudgetViewCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this category.' })
  name!: string;

  @ApiMoneyProperty({
    description:
      "What this month's assignment holds. Last month's leftover is not added in; it shows " +
      'as available being larger than this.',
  })
  assigned!: string;

  @ApiMoneyProperty({ description: "The month's own transactions, signed." })
  activity!: string;

  @ApiMoneyProperty({
    description:
      'Assigned and activity from the beginning of time up to and including this month. It ' +
      'goes below zero on an overspend, which is a signal rather than an error.',
  })
  available!: string;
}

export class BudgetViewGroupResponse implements BudgetViewGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this group.' })
  name!: string;

  @ApiProperty({ type: [BudgetViewCategoryResponse] })
  categories!: BudgetViewCategoryResponse[];
}

export class BudgetViewResponse implements BudgetViewDto {
  @ApiCalendarMonthProperty({ description: 'The month these numbers describe.' })
  month!: CalendarMonth;

  @ApiMoneyProperty({
    description:
      'Money that has arrived and has no job yet. It belongs to the budget rather than to a ' +
      'month: an assignment to any month, future ones included, lowers it at once.',
  })
  readyToAssign!: string;

  @ApiProperty({ type: [BudgetViewGroupResponse] })
  groups!: BudgetViewGroupResponse[];
}
