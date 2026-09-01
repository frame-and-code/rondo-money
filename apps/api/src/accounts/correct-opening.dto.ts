import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { ApiMoneyProperty } from '@/validation/money.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CorrectOpeningDto {
  @ApiMoneyProperty({
    sign: 'nonNegative',
    description:
      'What the account actually held the day it was opened, in minor units of the budget ' +
      'currency. Zero is a valid amount: an account can be opened with a number that was wrong ' +
      'twice. The day and the direction are not here, because neither of them is correctable.',
  })
  amount!: string;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two corrections again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
