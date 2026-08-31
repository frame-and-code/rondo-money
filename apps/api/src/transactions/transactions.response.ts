import { ApiProperty } from '@nestjs/swagger';
import {
  type CalendarDate,
  type PayeesDto,
  type TransactionDayDto,
  type TransactionPageDto,
} from '@rondo/types';

import { TransactionResponse } from '@/transactions/transaction.response';
import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export class TransactionDayResponse implements TransactionDayDto {
  @ApiCalendarDateProperty({ description: 'The day these records belong to.' })
  date!: CalendarDate;

  @ApiMoneyProperty({
    description:
      'What the whole day comes to under the filter that was asked for, not what this page of ' +
      'it happens to hold. A day cut by a page boundary reads the same on both pages.',
  })
  total!: string;
}

export class TransactionPageResponse implements TransactionPageDto {
  @ApiProperty({ type: [TransactionResponse] })
  transactions!: TransactionResponse[];

  @ApiProperty({ type: [TransactionDayResponse] })
  days!: TransactionDayResponse[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Where to carry on from, and null once the feed has reached its end.',
  })
  nextCursor!: string | null;
}

export class PayeesResponse implements PayeesDto {
  @ApiProperty({
    type: [String],
    description:
      'Every name this budget has recorded, once each and in alphabetical order. The list is ' +
      'small enough to be held and searched in the browser.',
  })
  payees!: string[];
}
