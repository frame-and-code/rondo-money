import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class EraseMeDto {
  @ApiProperty({
    description:
      'Minted once when the confirmation opens, never per request. A key per request makes a ' +
      'double click two erases again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
