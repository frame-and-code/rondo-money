import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class DeleteTransferDto {
  @ApiProperty({
    description:
      'Minted once when the confirmation opens. A repeat under the same key is answered with ' +
      'the pair that was removed rather than with a refusal.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
