import { ApiProperty } from '@nestjs/swagger';
import { type LanguageTag } from '@rondo/types';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

import { LANGUAGE_TAGS } from '@/user-settings/language';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateUserSettingsDto {
  @ApiProperty({
    description: 'The language to speak to this user in, as a BCP 47 primary subtag.',
    enum: LANGUAGE_TAGS,
    enumName: 'LanguageTag',
    example: 'ru',
  })
  @IsIn(LANGUAGE_TAGS)
  language!: LanguageTag;

  @ApiProperty({
    description:
      'Minted once when the choice is made, never per request. A key per request makes a ' +
      'double click two writes again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
