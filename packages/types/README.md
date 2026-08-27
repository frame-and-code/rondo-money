# @rondo/types

Shared DTOs and domain types.

**Money** is an integer number of minor units in `bigint`, and the number of minor digits
comes from the currency, never a hardcoded 2. `minorDigits('JPY')` is 0 and
`minorDigits('BHD')` is 3. That count is the runtime's currency data (ICU/CLDR), deliberately
**not** the ISO 4217 exponent. ISO still gives the forint two minor digits, the fillér left
circulation in 1999, and showing a HUF budget with decimals is wrong in the only way a user
notices. Sixteen currencies differ this way, and `test/currency.spec.ts` pins every one of
them, because the digit count decides the scale money is stored at and it ships with the
runtime. Over the wire money is a base-10 **string**, because JSON has no bigint.
`serializeMoney` / `parseMoney` convert at the edge, and `MONEY_PATTERN` is the single
definition of that shape, shared with the API's validator and the `pattern` published in the
OpenAPI schema.

**The list of currencies** lives here too, and it comes from the runtime rather than from a
table of our own: `supportedCurrencyCodes()` reads the codes the platform knows and
`isSupportedCurrency` answers whether one exists. That is a different question from
`isCurrencyCode`, which only says whether a string is three uppercase letters, so `ZZZ` passes
the second and fails the first. Both ends use these: the API refuses an unknown code at the
boundary, and the screen searches the same list. `CURRENCY_PATTERN` is the shape, and it is
what the OpenAPI schema publishes; the codes themselves are not published, because they move
when the runtime does.

`toDecimalString` / `parseDecimalString` convert between minor units and the decimal form a
person reads and types (`1250n` ↔ `"12.50"` at two digits). They take the **digit count**, not
a currency, because the count a budget works at is frozen on the budget row and looking it up
again from the currency is how an amount gets written at one scale and read at another. They
convert the scale and nothing else. No currency symbol, no grouping separator, no
locale-specific decimal mark. Rendering an amount for a screen belongs to the UI, which puts
`Intl.NumberFormat` on top. Parsing refuses more precision than the count allows rather than
rounding it away. The amount someone typed and the amount that gets stored have to be the same
number.

`MONEY_NON_NEGATIVE_PATTERN` is the same canonical form with the sign dropped, for an amount
that may not go below zero such as an account's opening balance, and `MONEY_POSITIVE_PATTERN`
drops the zero too, for an amount that would do nothing at zero such as a move between
envelopes.

**Calendar dates** are `YYYY-MM-DD` strings with no time attached, and the month bucket is
`YYYY-MM`. `todayIn` and `calendarDateIn` take the IANA zone to answer in, which is the
budget's; `monthOf` buckets a date; `parseCalendarDate` refuses anything that is not a real
day, so `2026-02-30` throws instead of rolling over into March the way `new Date` does.
Nothing here reads the host's zone, and `new Date()` outside this module is how a
transaction lands in the wrong month for anyone east or west of the server.

The month bucket has the same pair of directions. `parseCalendarMonth` refuses anything that
is not a real `YYYY-MM`, so `2026-00`, `2026-13` and a year below a thousand throw rather than
becoming a month nobody wrote. That floor is not cosmetic: a three-digit year is rendered
without its leading zero, and every instant computed from one comes back invalid. `toDbMonth` writes the first day of that month, which is the only shape the assignment
column stores, and `calendarMonthOf` reads it back. That one refuses a value carrying a time
and a day that is not the first, for the reason `calendarDateOf` refuses a time: rounding
either would name a month the writer never chose. `nextCalendarMonth` and
`previousCalendarMonth` step to the neighbouring month, across the turn of the year included,
and each refuses to step outside the range the parser takes rather than naming a month that
throws on the next call. `CALENDAR_MONTH_PATTERN` is what an API publishes
and its pipe enforces, and it is **narrower** than what the parser takes: `1900-01` through
`2999-12`. Every month in that range has a neighbouring month the helpers below can still
bound, so an endpoint cannot accept a value that throws two calls later.

`monthStartInstant` is the one direction that turns a month into a **moment**: the instant that
month begins in a given zone, which is what a comparison against a timestamp column needs. Use
it for a timestamp and never for a `date` column, where the plain calendar date is the right
bound and a moment shifts rows a day either way. A day whose local midnight does not exist,
because the clock jumped over it, answers with the first instant that day does have.

A date that came **out of the database** takes the other pair. `calendarDateOf` reads the day
a `date` column stores and `toDbDate` writes one back; neither takes a zone, because a stored
calendar date is not an instant and converting it through one shifts the day. Passing such a
value to `calendarDateIn` is that mistake, so `calendarDateOf` refuses anything carrying a
time rather than picking a day for you.

**The look of a category** is two short domain names, `CATEGORY_ICONS` and `CATEGORY_COLORS`,
with a guard for each. A name says what the category is, not what draws it: the API stores and
publishes the name, and the screen decides which component and which colour token it becomes.
So a redraw touches one map in `apps/web` and no rows. Both are nullable everywhere, because a
category the user made carries neither until they choose.

## Build

⚠️ **The package emits.** Consumers take types from the sources (`exports.types` →
`src/index.ts`) and the runtime from `dist` (`exports.default` → `dist/index.js`), the same
arrangement as `@rondo/db`. That is what lets `apps/api` call `parseMoney` rather than only
import its type. Without `dist` an api that imports a value rather than a type compiles and
then fails to boot.

Consequences worth knowing before debugging something stranger:

- relative imports inside `src` are written with a `.js` extension while the files on disk are
  `.ts`, and the jest config maps that back. Nothing forces this. The package declares no
  `"type": "module"`, so its files are CommonJS and extensionless imports resolve perfectly.
  It is a convention, kept by hand, so the specifiers stay valid
  if this package ever becomes ESM, where they would stop being optional;
- `apps/api` tests resolve this package through `dist`, so they need it built first. Turbo's
  `^build` already does that. A bare `npx jest` in `apps/api` on a fresh clone does not.
- `pnpm dev` watches this package and the api restarts on the re-emitted `dist`. The loop is
  described in [`apps/api/README.md`](../../apps/api/README.md). Outside a `pnpm dev` session
  nothing watches, so a one-off rebuild is `pnpm --filter @rondo/types build`.

```bash
pnpm --filter @rondo/types dev     # tsc --watch → dist (what `pnpm dev` runs)
pnpm --filter @rondo/types build   # tsc → dist
pnpm --filter @rondo/types test    # jest, held at 100% coverage
```
