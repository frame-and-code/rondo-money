import { ApiProperty } from '@nestjs/swagger';
import { type LanguageTag, type UserSettingsDto } from '@rondo/types';

import { LANGUAGE_TAGS } from '@/user-settings/language';

export class UserSettingsResponse implements UserSettingsDto {
  @ApiProperty({
    description:
      "The interface language, as a BCP 47 primary subtag. Set from the caller's " +
      '`Accept-Language` when the settings row is first created, and changed from the ' +
      'settings screen afterwards.',
    enum: LANGUAGE_TAGS,
    enumName: 'LanguageTag',
    example: 'en',
  })
  language!: LanguageTag;
}
