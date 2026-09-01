import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';

import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { ApiMoneyProperty } from '@/validation/money.decorator';

const lowercased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', description: 'The account the money leaves.' })
  @Transform(lowercased)
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty({ format: 'uuid', description: 'The account the money arrives on.' })
  @Transform(lowercased)
  @IsUUID()
  toAccountId!: string;

  @ApiMoneyProperty({
    sign: 'positive',
    description:
      'What moves, in minor units and without a sign. The server writes one sign on each leg, ' +
      'so the pair always mirrors.',
  })
  amount!: string;

  @ApiCalendarDateProperty({
    description:
      'The day the money moved, in the budget timezone. It is never later than today and never ' +
      'earlier than the day the later of the two accounts was opened.',
  })
  date!: string;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two transfers again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
