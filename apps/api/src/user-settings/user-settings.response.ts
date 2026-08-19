import { ApiProperty } from '@nestjs/swagger';
import { type LanguageTag, type UserSettingsDto } from '@rondo/types';

import { LANGUAGE_TAGS } from '@/user-settings/language';

/**
 * A user's own settings, as published.
 *
 * Only `language`: the row's id and timestamps are the backend's business, and a field
 * published once is far harder to withdraw from a contract than to add to it. Phases 2–3 add
 * currency, timezone and number format here as they arrive.
 */
export class UserSettingsResponse implements UserSettingsDto {
  @ApiProperty({
    description:
      'The interface language, as a BCP 47 primary subtag. Set from the caller’s ' +
      '`Accept-Language` when the settings row is first created, and changeable by the ' +
      'user from Phase 7.',
    enum: LANGUAGE_TAGS,
    // Names the enum in the published schema, so the generated client gets a reusable
    // `LanguageTag` union instead of an anonymous one inlined per response.
    enumName: 'LanguageTag',
    example: 'en',
  })
  language!: LanguageTag;
}
