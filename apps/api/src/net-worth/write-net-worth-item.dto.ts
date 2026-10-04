import { ApiProperty } from '@nestjs/swagger';
import { type CalendarDate } from '@rondo/types';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export const NAME_MAX = 60;

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class WriteNetWorthItemDto {
  @ApiProperty({ description: 'What the user calls it.', minLength: 1, maxLength: NAME_MAX })
  @IsString()
  @Transform(trimmed)
  @Length(1, NAME_MAX)
  name!: string;

  @ApiMoneyProperty({
    sign: 'nonNegative',
    description:
      'What it is worth, or what is owed, in minor units of the budget currency. Zero is a ' +
      'valid amount. A liability is written as a plain amount too: the section carries the sign.',
  })
  amount!: string;

  @ApiCalendarDateProperty({
    required: false,
    description:
      'The day the amount was true, not later than today in the budget timezone. The body is ' +
      'the whole record, so leaving this out stores no day, and on a change takes the stored ' +
      'one off.',
  })
  date?: CalendarDate;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two writes again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
