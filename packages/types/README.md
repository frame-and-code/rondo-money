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

`toDecimalString` / `parseDecimalString` convert between minor units and the decimal form a
person reads and types (`1250n` ↔ `"12.50"` in USD). They convert the **scale** and nothing
else. No currency symbol, no grouping separator, no locale-specific decimal mark. Rendering
an amount for a screen belongs to the UI, which puts `Intl.NumberFormat` on top of the digit
count this package owns. Parsing refuses more precision than the currency has rather than
rounding it away. The amount someone typed and the amount that gets stored have to be the
same number.

## Build

⚠️ **The package emits.** Consumers take types from the sources (`exports.types` →
`src/index.ts`) and the runtime from `dist` (`exports.default` → `dist/index.js`), the same
arrangement as `@rondo/db`. That is what lets `apps/api` call `parseMoney` rather than only
import its type. There used to be no build, `main` pointed at a `.ts` file, and an api that
imported a value from here compiled and then failed to boot.

Consequences worth knowing before debugging something stranger:

- relative imports inside `src` are written with a `.js` extension while the files on disk are
  `.ts`, and the jest config maps that back. Nothing forces this. The package declares no
  `"type": "module"`, so its files are CommonJS and extensionless imports resolve perfectly;
  that was measured, not assumed. It is a convention, kept by hand, so the specifiers stay valid
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
