import { ApiProperty } from '@nestjs/swagger';
import {
  MOVE_SIDE_KINDS,
  type CalendarMonth,
  type MoveDto,
  type MoveSideDto,
  type MoveSideKind,
} from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

export class MoveSideResponse implements MoveSideDto {
  @ApiProperty({ enum: MOVE_SIDE_KINDS, enumName: 'MoveSideKind', example: 'CATEGORY' })
  kind!: MoveSideKind;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description: 'Carried by a category side, and absent from a ready to assign one.',
  })
  categoryId?: string;
}

export class MoveResponse implements MoveDto {
  @ApiCalendarMonthProperty({ description: 'The month whose envelopes the money moved between.' })
  month!: CalendarMonth;

  @ApiMoneyProperty({ sign: 'positive', description: 'What moved, in minor units.' })
  amount!: string;

  @ApiProperty({ type: MoveSideResponse })
  from!: MoveSideResponse;

  @ApiProperty({ type: MoveSideResponse })
  to!: MoveSideResponse;
}
