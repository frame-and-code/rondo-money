import { ApiProperty } from '@nestjs/swagger';
import {
  TARGET_KINDS,
  type CalendarMonth,
  type CategoryTargetDto,
  type TargetKind,
} from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class CategoryTargetResponse implements CategoryTargetDto {
  @ApiProperty({ enum: TARGET_KINDS, enumName: 'TargetKind', example: 'CONTRIBUTE' })
  kind!: TargetKind;

  @ApiMoneyProperty({ sign: 'positive', description: 'What the goal is aiming at.' })
  amount!: string;

  @ApiCalendarMonthProperty({
    description:
      'The month the goal started in. It is written when the goal is created and never moves, ' +
      'because it is what decides which months read this goal rather than another.',
  })
  startMonth!: CalendarMonth;

  @ApiCalendarMonthProperty({
    required: false,
    description: 'The month the amount is due, carried only by a goal saving by a date.',
  })
  dueMonth?: CalendarMonth;

  @ApiCalendarMonthProperty({
    required: false,
    description:
      'The month the goal was closed in. It is still shown in that month and gone from the ' +
      'next one.',
  })
  endMonth?: CalendarMonth;
}
