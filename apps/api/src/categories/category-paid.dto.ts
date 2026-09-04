import { IdempotentDto } from '@/categories/categories.dto';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class CategoryPaidMonthDto extends IdempotentDto {
  @ApiCalendarMonthProperty({
    description:
      'The month the mark belongs to. It is the month the screen is showing rather than the ' +
      'one the budget is living in, so a bill paid late can be marked in the month it was for.',
  })
  month!: string;
}
