import { ApiProperty } from '@nestjs/swagger';
import {
  CALENDAR_DATE_PATTERN,
  type CalendarDate,
  type NetWorthItemDto,
  type NetWorthItemsDto,
} from '@rondo/types';

import { NAME_MAX } from '@/net-worth/write-net-worth-item.dto';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export class NetWorthItemResponse implements NetWorthItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls it.', maxLength: NAME_MAX })
  name!: string;

  @ApiMoneyProperty({
    sign: 'nonNegative',
    description:
      'What it is worth, or what is owed, in minor units of the budget currency. Never below ' +
      'zero: the section it sits in carries the sign.',
  })
  amount!: string;

  @ApiProperty({
    type: String,
    pattern: CALENDAR_DATE_PATTERN.source,
    example: '2026-08-31',
    nullable: true,
    description: 'The day the amount was true, absent when the user gave none.',
  })
  date!: CalendarDate | null;
}

export class NetWorthItemsResponse implements NetWorthItemsDto {
  @ApiProperty({
    type: [NetWorthItemResponse],
    description: 'What the active budget holds of this kind, oldest first.',
  })
  items!: NetWorthItemResponse[];
}
