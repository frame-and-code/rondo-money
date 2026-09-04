import { ApiProperty } from '@nestjs/swagger';
import { type CalendarMonth, type CategoryPaidMonthDto } from '@rondo/types';

import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class CategoryPaidMonthResponse implements CategoryPaidMonthDto {
  @ApiProperty({ format: 'uuid', description: 'The category the mark is on.' })
  categoryId!: string;

  @ApiCalendarMonthProperty({ description: 'The month the mark belongs to.' })
  month!: CalendarMonth;

  @ApiProperty({
    description:
      'Whether the category carries the mark in that month now. True after marking, false ' +
      'after taking the mark off, whichever state it was in before.',
  })
  paid!: boolean;
}
