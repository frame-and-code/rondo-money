import { ApiProperty } from '@nestjs/swagger';
import {
  TARGET_KINDS,
  type BudgetViewCategoryDto,
  type BudgetViewDto,
  type BudgetViewGroupDto,
  type CalendarMonth,
  type CategoryColor,
  type CategoryIcon,
  type BudgetViewTargetDto,
  type TargetKind,
} from '@rondo/types';

import { ApiCategoryColorProperty } from '@/validation/color.decorator';
import { ApiCategoryIconProperty } from '@/validation/icon.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class BudgetViewTargetResponse implements BudgetViewTargetDto {
  @ApiProperty({ enum: TARGET_KINDS, enumName: 'TargetKind', example: 'CONTRIBUTE' })
  kind!: TargetKind;

  @ApiMoneyProperty({ sign: 'positive', description: 'What the goal is aiming at.' })
  amount!: string;

  @ApiCalendarMonthProperty({ description: 'The month this goal started in.' })
  startMonth!: CalendarMonth;

  @ApiCalendarMonthProperty({
    required: false,
    description: 'The month the amount is due, carried only by a goal saving by a date.',
  })
  dueMonth?: CalendarMonth;

  @ApiMoneyProperty({
    required: false,
    sign: 'nonNegative',
    description:
      'What the goal asks of this month in total. A goal saving with no date asks for nothing ' +
      'monthly and carries none.',
  })
  monthTarget?: string;

  @ApiMoneyProperty({
    required: false,
    sign: 'nonNegative',
    description: 'What is still to be assigned this month for the goal to be met.',
  })
  needed?: string;

  @ApiMoneyProperty({
    description:
      'What the goal counts as gathered. Spending in the month being read never lowers it. A ' +
      'goal that refills the envelope counts what earlier months left in it, so spending ' +
      'before this month does.',
  })
  progress!: string;

  @ApiMoneyProperty({
    sign: 'nonNegative',
    description: 'What is left between the progress and the amount.',
  })
  remaining!: string;
}

export class BudgetViewCategoryResponse implements BudgetViewCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this category.' })
  name!: string;

  @ApiCategoryIconProperty({
    nullable: true,
    description:
      'Which icon this category is drawn with, as a domain name rather than the name of a ' +
      'component. A category nobody has given one carries null, and so does a stored name ' +
      'this app no longer draws.',
  })
  icon!: CategoryIcon | null;

  @ApiCategoryColorProperty({
    nullable: true,
    description: 'Which colour this category is drawn in, on the same terms as its icon.',
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

  @ApiMoneyProperty({
    description:
      'The same sum over every month rather than up to this one, so a later month is counted ' +
      'too. This is the amount that has to be zero before the category can be hidden.',
  })
  availableAllTime!: string;

  @ApiProperty({
    description:
      'Whether this category is hidden in the month that was asked about. A category hidden ' +
      'in February is not hidden in January, and only shows up here when the caller asked for ' +
      'the hidden ones.',
  })
  hidden!: boolean;

  @ApiProperty({
    type: BudgetViewTargetResponse,
    nullable: true,
    description:
      'The goal this category is running in the month that was asked about, and null when it ' +
      'runs none. A category keeps its goals, so which one appears here is decided by the ' +
      'month rather than by which was written last.',
  })
  target!: BudgetViewTargetResponse | null;
}

export class BudgetViewGroupResponse implements BudgetViewGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this group.' })
  name!: string;

  @ApiProperty({
    description: 'Whether this group is hidden in the month that was asked about.',
  })
  hidden!: boolean;

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
