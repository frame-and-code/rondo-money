import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class BudgetViewQueryDto {
  @ApiCalendarMonthProperty({
    description:
      'The month the screen is showing. Required: a default here would make the answer depend ' +
      'on a clock rather than on what the user is looking at.',
  })
  month!: string;
}
