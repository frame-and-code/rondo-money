# @rondo/web

Rondo Money frontend on **Next.js (App Router)**.

The app shell is in place: a persistent navigation over its sections, sign-in and route
protection, the shadcn/ui base from `@rondo/ui`, the locale switcher and the typed API client
`@rondo/api-client` (ADR-002), which `src/lib/api` wires to the Clerk session and to TanStack
Query. Server state lives in that cache, not in component state. Categories is a real screen:
it draws a month of the budget, moves money between its envelopes, assigning included, and lets
the user arrange the categories themselves, creating, renaming, repainting, reordering and
hiding them. Money flow is a real screen too: the accounts sit on the left with what each of them
holds and what they hold together, the records run beside them as a feed by days, and the
screen takes an account, a rename and an income or an expense from its dialogs. Net worth and settings are
still slots.

Setup is a gate rather than a suggestion. A user with no budget, or with a budget and no
account, is on a step of it, and every address behind the sign-in leads to that step until
both exist. Once they do, the steps themselves are closed.

## Structure

```text
src/
  app/
    layout.tsx                # root layout (html/body, providers, metadata)
    page.tsx                  # the one address people type by hand. It carries them into
                              # the app, where the gate reads which step they are on
    globals.css               # Tailwind entry point + the theme's CSS variables. `--font-sans`
                              # points at the variable `next/font` sets in layout.tsx, so a
                              # font name written back into that line silently drops the font.
                              # It also holds the two rules the app states over the primitives:
                              # the pointer on menu and option roles, and the scroll lock under
                              # an open overlay, which a primitive cannot apply because the
                              # shell scrolls `main` rather than the document
    icon.svg                  # the app icon Next wires into every page; the same mark the
                              # onboarding screens draw, with the primary tokens written out
                              # because an asset cannot read a CSS variable
    sign-in/[[...sign-in]]/   # the only public screen (Clerk catch-all route)
    api/health/route.ts       # liveness probe for Railway — public, answers 200 flat; also
                              # reports the mode the bundle was built in, which is what e2e
                              # read to refuse a dev server (F1.11)
    new/layout.tsx            # the gate over both steps: which one this is comes from the
                              # path, so a user standing on the wrong one is moved
    new/page.tsx              # onboarding step 1, creating a budget, deliberately outside
                              # (app): the shell would navigate to sections a user without a
                              # budget cannot use. Rendered per request (`force-dynamic`)
                              # because it picks the name example shown in the field; built
                              # once, every visitor for the life of the deployment would see
                              # the same one
    new/account/page.tsx      # onboarding step 2, the first account and its opening balance.
                              # Ends the flow by opening the app on Categories
    (app)/                    # the app shell: a sidebar on desktop, a bottom tab bar on a
                              # phone, and the sections it navigates
      layout.tsx              # the gate over the app, and AppShell around every section
      categories/             # the month of the budget: page.tsx renders BudgetMonth, and
                              # loading.tsx the same skeleton the screen shows while it reads
      accounts/               # money flow: page.tsx renders MoneyFlow, the accounts panel
                              # beside the feed, and loading.tsx the skeleton it shows
      net-worth/              # the remaining sections are page.tsx (the slot) + loading.tsx
      settings/
  components/                 # app-level components: the shell and its navigation, the
                              # onboarding gate and what it shows while it decides, the
                              # section slot, the loading region, the Clerk provider wrapper,
                              # the locale switcher, the two onboarding forms, the field an
                              # amount is typed into, which the onboarding form and the
                              # accounts dialog share, the money flow screen and everything on
                              # it (the accounts panel, the feed by days and its rows, the
                              # record form, the payee field, the filters, the empty states and
                              # the delete confirmation), the dialog an account is created and
                              # renamed from, and the categories screen: the month
                              # header, a group, a tile that opens the move dialog, its spend
                              # ring, the fields that move money between envelopes, the
                              # actions folded under them, the dialog a category is set up in,
                              # the one a group is, the two that hide a category and a group,
                              # the badge with its tooltip and the panel that explain a goal,
                              # the form it is set in, the amount whose digits roll when it
                              # changes, and the banner that says a save did not go through
  i18n/                       # ru / en / pl — dictionaries, detection, context. English is
                              # the fallback (F1.6); settings-locale.tsx feeds the language
                              # from GET /user-settings back into the locale context
  lib/api/                    # the only way to reach @rondo/api: ApiProvider wires the
                              # generated client (@rondo/api-client) to the address, the
                              # Clerk token and the TanStack Query cache
  lib/currencies.ts           # the currency list for a locale: codes from @rondo/types,
                              # names from Intl.DisplayNames, memoised per locale
  lib/money.ts                # reading an amount a person typed through their locale's own
                              # marks, and showing one at the budget's digit count. Every
                              # screen that touches money uses it, so a sign is refused or
                              # allowed in one place. Three ways out, and the difference
                              # matters: `format` for a shown amount, which drops a fraction
                              # that is all zeros and puts the symbol after the number in
                              # every locale, `plain` for one whose currency is carried by a
                              # neighbour, and `typed` for a field, which keeps every decimal
                              # because a trimmed one fights the caret
  lib/calendar-locale.ts      # the app's language to the date-fns locale the calendar and the
                              # month label are formatted with
  lib/calendar-day.ts         # a calendar date to the Date a picker works in and back, built
                              # from local parts so a day never shifts across a timezone
  lib/last-entry.ts           # what the last record was written with, kept per budget in the
                              # browser, so the next form opens on the same day, envelope and
                              # counterparty
  lib/budget-month.ts         # which month the screen shows, its label, and the two arcs a
                              # tile's ring is drawn with, from the goal when there is one and
                              # from the envelope when there is not. Today comes from the
                              # budget's timezone
  lib/category-look.ts        # a category's icon and colour name to a component and a token,
                              # with the money icon for a category nobody has given one
  lib/category-order.ts       # where a dragged category lands, as a pure list-to-list move,
                              # so the order a drop asks for is testable without a browser
  lib/move-target.ts          # the envelopes a move can name as its other side, built from
                              # the month on screen: what is free first, then the categories,
                              # never the one the money is leaving
  lib/save-failure.ts         # what a refused save was, read from the answer's reason rather
                              # than from its message, and what the screen does about each
  lib/transaction-failure.ts  # the same for a refused record, one message per reason the API
                              # names, and one fallback for a reason it does not
  lib/transaction-feed.ts     # the records of one page cut into days, each with the total the
                              # server counted for the whole day rather than for the page
  lib/sections.ts             # the sections in one place: route, message key, icon.
                              # The navigation, the header title and the browser tab all
                              # read it, so a section is named the same in every one
  lib/onboarding.ts           # how far setup got, and the route each answer belongs on.
                              # The gate reads it, and nothing else decides where a user
                              # part way through setup is sent
  lib/auth.ts                 # SIGN_IN_URL and HEALTH_URL — the paths proxy.ts,
                              # railway.json and the routes must agree on
  proxy.ts                    # clerkMiddleware: everything is protected except the
                              # public matcher (sign-in, the health route)
```

## Running

```bash
pnpm --filter @rondo/web dev     # next dev on :3001 (API takes :3000)
pnpm --filter @rondo/web build   # next build (standalone build for Railway)
pnpm --filter @rondo/web start   # next start on :3001
pnpm --filter @rondo/web test    # unit, then e2e (see docs/testing.md for prerequisites)
pnpm test:e2e                   # Playwright — incl. the F1.1 sign-in/out scenarios
```

E2E build the app and serve it with `next start` (F1.11), never `next dev`, which is a
different application and would make a green suite meaningless as evidence about the deployed
one. So a run costs a build (about 5 seconds when nothing changed), and Playwright refuses a
`pnpm dev` server on :3001 rather than reusing it. Don't park a production server there either.
The refusal reads the build's mode, not its age, so a stale one would be reused silently.
Details in [docs/testing.md](../../docs/testing.md).

All pages are Clerk-protected (F1.1). `src/proxy.ts` redirects anonymous visitors to
`/sign-in` (`clerkMiddleware` + `auth.protect()`).

## Data from the API

`ApiProvider` (in [src/lib/api](src/lib/api/client.tsx), mounted in the root layout) configures
the generated client once, with the base URL, the Clerk token and the TanStack Query cache.
Screens then only ask for data:

```tsx
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';

const { data, isError } = useQuery(meControllerIdentifyOptions());
```

There is no token handling at the call site, and there should never be. Each generated request
carries the security its operation declares in the OpenAPI spec, so `GET /me` is sent with a
bearer token and the public healthcheck without one. `@Public()` in `apps/api` decides which
endpoints are open, and web holds no list of them.

It configures during render, not in an effect. A parent's effects run after its children's, so
an effect would let the first screen fire against an unconfigured client, and the cache is
cleared during render for the same reason. The `isLoaded` guard is separate. Clerk reports
`userId: undefined` until it has a session, and reacting to that would empty the cache on every
page load for nothing.

The provider configures that client **in the browser only**. It is a single instance per
process, so configuring it while Next renders on the server would hand one visitor's token to
every concurrent request. Server code therefore gets a deliberately unconfigured client.
Nothing needs one yet; when something does, it builds its own per request from `await auth()`
and passes it explicitly, in this same `src/lib/api` module rather than in a hand-written
`fetch`.

`ApiProvider` empties the query cache when the Clerk user id changes, so signing out and back
in as someone else on the same tab starts from nothing rather than serving the previous user's
data, including to screens that were already on the page.

That last part is the whole point, and it is why the provider _clears_ one cache instead of
handing out a new one, which is what it did until F1.6. `useBaseQuery` binds its observer to a
client once and never rebinds it (verified against the installed
`@tanstack/react-query@5.101.4`), so replacing the client reached only what mounted afterwards.
Signing out and back in is a soft navigation, so nothing unmounts. Remounting the subtree
per identity would also work and costs far too much. `userId` goes from `undefined` to the
signed-in user on every page load, so the theme provider and every screen would be rebuilt once
per load rather than once per user.

The first thing the app asks for is the user's own settings.
[`SettingsLocaleSync`](src/i18n/settings-locale.tsx) sits in the root layout, renders nothing,
and calls `GET /user-settings` as soon as there is a session. That call is also what creates
the row, since the endpoint is get-or-create (F1.6). Three sources can decide the interface
language, and [`locale-context.tsx`](src/i18n/locale-context.tsx) holds the order in one
expression: **the user's own pick** (kept in `localStorage`, because `PATCH /user-settings` is
Phase 7 and the sign-in screen has no session to read settings with) beats **the account's
settings**, which beat **the browser**. Reversing the last two would hand the choice back to
the server on every reload, which is the defect the storage exists to remove.

Both of the first two are scoped to the signed-in account, because browsers get shared. The
stored pick lives under `rondo.locale:<userId>`, and a signed-out visitor gets the bare
`rondo.locale`, which is the sign-in screen, belonging to no account. The settings
language is reported together with the user it belongs to, so a language arriving for the
previous account cannot be applied to the next one. Storage access is wrapped as well. Safari
with "Block All Cookies" and a sandboxed iframe throw on reading `window.localStorage` at all,
and this provider sits above every screen with no error boundary under it.

## Environment

The env contract lives in [.env.local.tpl](.env.local.tpl) (there is no separate
`.env.example`). Generate `apps/web/.env.local` from it:

```bash
pnpm env:setup   # at the repo root; needs the 1Password CLI (see setup-env.sh)
```

Without 1Password, copy the template to `.env.local` and fill the `{{ op://... }}`
references by hand.

- `NEXT_PUBLIC_API_URL` is the base address of `@rondo/api`. Next inlines the value into the
  browser bundle (`NEXT_PUBLIC_*`), and it defaults to `http://localhost:3000`. On Railway it
  points to the deployed API.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` carry Clerk authentication
  (F1.1) and are **required**. Without them `clerkMiddleware` rejects every request. Take both
  from [dashboard.clerk.com](https://dashboard.clerk.com) → your application → API Keys
  (the dev instance); the instance must have the **email verification code** sign-in
  method enabled (e2e test accounts use it). The publishable key is inlined into the
  bundle at build time; the secret key is server-only.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `jsx: preserve`,
  DOM libraries and the `next` plugin. The base is already ESM/bundler-oriented, exactly
  what App Router needs, so we only duplicate the Next-specific bits.
- **Browser globals in ESLint:** the shared base registers only `globals.node`;
  here `globals.browser` is added on top for client code (otherwise `no-undef`
  on `window`/`document`).
- **`@/` alias:** `@/* → src/*` was set in F0.2; Next resolves it natively, with no extra
  configuration needed.
