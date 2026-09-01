import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { ApiMoneyProperty } from '@/validation/money.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReconcileAccountDto {
  @ApiMoneyProperty({
    description:
      'What the account really holds right now, in minor units of the budget currency. Any ' +
      'sign: an account that has been spent past its own money holds less than nothing, and ' +
      'saying so is the point of the reconciliation. The day is not here, because a ' +
      'reconciliation happens today by definition.',
  })
  balance!: string;

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
