import { ApiProperty } from '@nestjs/swagger';
import {
  TRANSACTION_TYPES,
  type CalendarDate,
  type TransactionDto,
  type TransactionType,
} from '@rondo/types';

import { PAYEE_MAX } from '@/transactions/create-transaction.dto';
import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export class TransactionResponse implements TransactionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The account the money moved on.' })
  accountId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The envelope the money left, absent on income that stays ready to assign.',
  })
  categoryId!: string | null;

  @ApiCalendarDateProperty({ description: 'The day the money moved, in the budget timezone.' })
  date!: CalendarDate;

  @ApiMoneyProperty({
    description:
      'What moved, in minor units and signed: money that left the account is below zero. The ' +
      'server writes the sign from the type.',
  })
  amount!: string;

  @ApiProperty({
    description: 'What the record is.',
    enum: TRANSACTION_TYPES,
    enumName: 'TransactionType',
    example: 'EXPENSE',
  })
  type!: TransactionType;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: PAYEE_MAX,
    description: 'Who was paid or who paid.',
  })
  payee!: string | null;

  @ApiProperty({
    description:
      'True for a record the app wrote itself, such as an opening balance. It counts like any ' +
      'other, takes a correction of its amount and is never deleted.',
  })
  isSystem!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Shared by the two legs of one transfer.',
  })
  transferId!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The account at the other end of a transfer, so a leg reads as a sentence.',
  })
  counterAccountId!: string | null;

  @ApiProperty({
    format: 'date-time',
    description:
      'When the record was entered, which is not the day the money moved. It orders the ' +
      'records of one day.',
  })
  createdAt!: string;
}
