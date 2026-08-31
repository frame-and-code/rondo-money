import { ApiProperty } from '@nestjs/swagger';
import { TRANSACTION_TYPES, type TransactionType } from '@rondo/types';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';

import { PAYEE_MAX } from '@/transactions/create-transaction.dto';
import { ApiCalendarDateProperty } from '@/validation/date.decorator';

export const PAGE_SIZE = 50;

export const PAGE_MAX = 100;

const lowercased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

export class ListTransactionsQueryDto {
  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'The account to read. Left out, the feed covers every account the budget still uses, ' +
      'and an archived one is in none of them.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(lowercased)
  @IsUUID()
  accountId?: string;

  @ApiProperty({ format: 'uuid', required: false, description: 'The envelope to read.' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(lowercased)
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    required: false,
    maxLength: PAYEE_MAX,
    description: 'One payee exactly as it was recorded.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, PAYEE_MAX)
  payee?: string;

  @ApiProperty({
    required: false,
    description:
      'One kind of record. An opening balance is income like any other, so it is in that ' +
      'answer too.',
    enum: TRANSACTION_TYPES,
    enumName: 'TransactionType',
    example: 'EXPENSE',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionType;

  @ApiCalendarDateProperty({ required: false, description: 'The first day to read, included.' })
  from?: string;

  @ApiCalendarDateProperty({ required: false, description: 'The last day to read, included.' })
  to?: string;

  @ApiProperty({
    required: false,
    description:
      'Where the previous page stopped. It is opaque: it names a day, a moment and a record, ' +
      'so a page boundary neither repeats a row nor skips one.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 200)
  cursor?: string;

  @ApiProperty({
    required: false,
    default: PAGE_SIZE,
    minimum: 1,
    maximum: PAGE_MAX,
    description: 'How many records to answer with.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX)
  limit?: number;
}
