import { ApiProperty } from '@nestjs/swagger';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type BudgetViewCategoryDto,
  type BudgetViewDto,
  type BudgetViewGroupDto,
  type CalendarMonth,
  type CategoryColor,
  type CategoryIcon,
} from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class BudgetViewCategoryResponse implements BudgetViewCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this category.' })
  name!: string;

  @ApiProperty({
    description:
      'Which icon this category is drawn with, as a domain name rather than the name of a ' +
      'component. A category nobody has given one carries null, and so does a stored name ' +
      'this app no longer draws.',
    enum: CATEGORY_ICONS,
    enumName: 'CategoryIcon',
    nullable: true,
  })
  icon!: CategoryIcon | null;

  @ApiProperty({
    description: 'Which colour this category is drawn in, on the same terms as its icon.',
    enum: CATEGORY_COLORS,
    enumName: 'CategoryColor',
    nullable: true,
  })
  color!: CategoryColor | null;

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
