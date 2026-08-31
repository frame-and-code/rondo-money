import { ApiProperty } from '@nestjs/swagger';
import { TRANSACTION_ENTRY_TYPES, type TransactionEntryType } from '@rondo/types';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export const PAYEE_MAX = 100;

const lowercased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

const named = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const name = value.trim();

  return name === '' ? undefined : name;
};

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTransactionDto {
  @ApiProperty({ format: 'uuid', description: 'The account the money moved on.' })
  @Transform(lowercased)
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    description:
      'What the record is. A transfer is not one of them: it exists only as a pair of legs and ' +
      'is written by its own operation.',
    enum: TRANSACTION_ENTRY_TYPES,
    enumName: 'TransactionEntryType',
    example: 'EXPENSE',
  })
  @IsIn(TRANSACTION_ENTRY_TYPES)
  type!: TransactionEntryType;

  @ApiMoneyProperty({
    sign: 'positive',
    description:
      'What moved, in minor units and without a sign. The direction is the type, and the ' +
      'server writes the sign, so an expense carrying a positive amount cannot land as income.',
  })
  amount!: string;

  @ApiCalendarDateProperty({
    description:
      'The day the money moved, in the budget timezone. It is never later than today and never ' +
      'earlier than the day the account was opened.',
  })
  date!: string;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'The envelope the money left. An expense names one; income may leave it out, and then ' +
      'the money stays ready to assign.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(lowercased)
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    required: false,
    maxLength: PAYEE_MAX,
    description: 'Who was paid or who paid. A name of spaces is no name at all.',
  })
  @Transform(named)
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, PAYEE_MAX)
  payee?: string;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two records again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
