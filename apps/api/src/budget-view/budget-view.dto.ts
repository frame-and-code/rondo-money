import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

const asBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') {
    return true;
  }

  return value === 'false' ? false : value;
};

export class BudgetViewQueryDto {
  @ApiCalendarMonthProperty({
    description:
      'The month the screen is showing. Required: a default here would make the answer depend ' +
      'on a clock rather than on what the user is looking at.',
  })
  month!: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Whether the answer carries the groups and categories hidden by this month. They stay in ' +
      'every aggregate either way, so this changes what is listed and never what is counted.',
    default: false,
  })
  @Transform(asBoolean)
  @IsOptional()
  @IsBoolean()
  includeHidden?: boolean;
}
