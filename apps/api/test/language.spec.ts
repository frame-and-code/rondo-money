import { $Enums } from '@rondo/db';

import { LANGUAGE_TAGS, toLanguage, toLanguageTag } from '@/user-settings/language';

describe('the language a column holds', () => {
  it('carries every language the app renders through the column and back', () => {
    for (const tag of LANGUAGE_TAGS) {
      expect(toLanguageTag(toLanguage(tag))).toBe(tag);
    }
  });

  it('offers a tag for every value the column can hold, and no other', () => {
    expect(LANGUAGE_TAGS).toHaveLength(Object.values($Enums.Language).length);

    for (const language of Object.values($Enums.Language)) {
      expect(LANGUAGE_TAGS).toContain(toLanguageTag(language));
    }
  });
});
