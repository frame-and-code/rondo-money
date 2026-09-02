import { type LanguageTag } from '@rondo/types';

import { DEFAULT_LANGUAGE_TAG, isLanguageTag } from '@/user-settings/language';

interface WeightedTag {
  tag: string;
  quality: number;
}

function parsePreference(entry: string): WeightedTag | null {
  const [tag, ...parameters] = entry.split(';').map((part) => part.trim().toLowerCase());
  if (!tag) return null;

  const weight = parameters
    .map((parameter) => parameter.split('='))
    .find(([name]) => name?.trim() === 'q')?.[1]
    ?.trim();

  if (weight !== undefined && !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(weight)) return null;

  const quality = weight === undefined ? 1 : Number(weight);
  if (quality <= 0) return null;

  return { tag, quality };
}

export function detectLanguageTag(header: string | undefined): LanguageTag {
  const preferences = (header ?? '')
    .split(',')
    .map(parsePreference)
    .filter((preference): preference is WeightedTag => preference !== null)
    .sort((first, second) => second.quality - first.quality);

  for (const { tag } of preferences) {
    const primary = tag.split('-')[0];
    if (primary !== undefined && isLanguageTag(primary)) return primary;
  }

  return DEFAULT_LANGUAGE_TAG;
}
