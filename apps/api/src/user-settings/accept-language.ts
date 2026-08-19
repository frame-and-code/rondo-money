import { type LanguageTag } from '@rondo/types';

import { DEFAULT_LANGUAGE_TAG, isLanguageTag } from '@/user-settings/language';

/** One entry of an `Accept-Language` header, after its parameters are read. */
interface LanguagePreference {
  tag: string;
  quality: number;
}

/**
 * Reads one comma-separated entry, e.g. `pl-PL;q=0.8`.
 *
 * Returns `null` for an entry that asks for nothing usable. A malformed weight is dropped
 * rather than defaulted to 1: defaulting would let `de;q=nonsense` outrank every language
 * the client actually asked for, which is the opposite of what it said.
 */
function parsePreference(entry: string): LanguagePreference | null {
  const [tag, ...parameters] = entry.split(';').map((part) => part.trim().toLowerCase());
  if (!tag) return null;

  // `q` is the only parameter that changes the outcome; RFC 9110 permits others, and
  // ignoring them is what it asks for.
  //
  // Split rather than matched on the `q=` prefix, so that spaces around the `=` are read as the
  // weight they plainly are. RFC 9110 does not allow them there, but the alternative is worse
  // than lenience: `pl;q = 0` would fall through as a parameter we do not recognise, `pl` would
  // keep the default weight of 1, and the one language the client explicitly refused would win.
  const weight = parameters
    .map((parameter) => parameter.split('='))
    .find(([name]) => name?.trim() === 'q')?.[1]
    ?.trim();

  // RFC 9110's qvalue grammar exactly: 0 or 1, with at most three decimals and nothing above
  // 1. Matched with a pattern rather than measured with `Number.parseFloat`, which reads a
  // number off the front of a string and discards the rest — `q=0.9junk` comes back as 0.9 and
  // outranks a well-formed `q=0.8`, and `q=2` outranks everything. Both are malformed
  // parameters, and a malformed parameter is ignored, not guessed at.
  if (weight !== undefined && !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(weight)) return null;

  const quality = weight === undefined ? 1 : Number(weight);
  if (quality <= 0) return null;

  return { tag, quality };
}

/**
 * The interface language an `Accept-Language` header asks for, or {@link DEFAULT_LANGUAGE_TAG}
 * when it asks for nothing we ship.
 *
 * Written out rather than delegating to Express's `req.acceptsLanguages()`, which would pull
 * the whole request object into a handler that needs one header — and this is small enough to
 * pin down with a unit test, which the framework's behaviour is not.
 *
 * The web app's own `detectBrowserLocale` does the same job for `navigator.languages`; the
 * difference is q-values, which a header has and that array does not.
 */
export function detectLanguageTag(header: string | undefined): LanguageTag {
  const preferences = (header ?? '')
    .split(',')
    .map(parsePreference)
    .filter((preference): preference is LanguagePreference => preference !== null)
    // Descending weight. `sort` is stable, so entries of equal weight keep the order the
    // client wrote them in — which is the only order it gave them.
    .sort((first, second) => second.quality - first.quality);

  for (const { tag } of preferences) {
    // Region and script are dropped: we ship one variant per language, so `en-GB` is `en`.
    // `*` survives this as `*`, matches nothing, and correctly falls through to the default.
    const primary = tag.split('-')[0];
    if (primary !== undefined && isLanguageTag(primary)) return primary;
  }

  return DEFAULT_LANGUAGE_TAG;
}
