import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_TYPES, type AccountType } from '@rondo/types';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

import { ApiMoneyProperty } from '@/validation/money.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAccountDto {
  @ApiProperty({ description: 'What the user calls this account.', minLength: 1, maxLength: 60 })
  @IsString()
  @Transform(trimmed)
  @Length(1, 60)
  name!: string;

  @ApiProperty({
    description:
      'Cash or a debit account. A credit card changes how Ready to Assign is counted and is ' +
      'not one of them.',
    enum: ACCOUNT_TYPES,
    enumName: 'AccountType',
    example: 'CASH',
  })
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @ApiMoneyProperty({
    nonNegative: true,
    description:
      'What the account holds right now, in minor units of the budget currency. It is stored ' +
      'as an income transaction dated today, never as a column on the account, so it stays ' +
      'correctable afterwards. Zero is a valid amount and still writes that transaction.',
  })
  initialBalance!: string;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two accounts again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
