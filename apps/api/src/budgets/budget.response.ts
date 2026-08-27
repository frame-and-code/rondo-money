import { ApiProperty } from '@nestjs/swagger';
import { type BudgetDto, type CalendarMonth } from '@rondo/types';

import { ApiCurrencyProperty } from '@/validation/currency.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';
import { ApiTimeZoneProperty } from '@/validation/timezone.decorator';

export class BudgetResponse implements BudgetDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this budget.', maxLength: 60 })
  name!: string;

  @ApiCurrencyProperty({
    description: 'The currency this budget holds. It is chosen once and never changes.',
  })
  currency!: string;

  @ApiProperty({
    description:
      "The currency's minor digit count, frozen when the budget was created. Read the scale " +
      'from here rather than recomputing it, or an amount written at one scale is read at ' +
      'another.',
    example: 2,
  })
  minorDigits!: number;

  @ApiTimeZoneProperty({
    description: 'The zone that decides what "today" is and which month an amount falls into.',
  })
  timezone!: string;

  @ApiCalendarMonthProperty({
    description:
      'The earliest month this budget can hold, read from when it was created in its own ' +
      'timezone. Nothing happened before it, so a screen has no month to show there.',
  })
  firstMonth!: CalendarMonth;

  @ApiProperty({
    description: 'A user holds at most one active budget, and the screens follow that one.',
  })
  active!: boolean;
}
