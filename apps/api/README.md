# @rondo/api

Rondo Money backend on **NestJS (REST)**. Skeleton F0.4, closed to anonymous callers since
F1.2, scoping every query for domain data to the caller since F1.3. The one deliberate
exception is the healthcheck's `SELECT 1`, which touches no tenant data and is named as such
below.

[`src/user-settings`](src/user-settings) is the smallest module carrying both paths: its read
is controller → service → `SCOPED_PRISMA`, and its write goes through the mutation point like
every other. [`src/mutations`](src/mutations) is the write path, the single point where one
user operation and its idempotency key are written in one transaction. Both stand on the
request context, the auto-scoped Prisma client and the raw-SQL repository below.
[`src/budgets`](src/budgets) uses both: `GET /budgets` reads through the scoped client, and
`POST /budgets` writes the budget, the caller's language and the starter categories in one
transaction. [`src/accounts`](src/accounts) is the same pair over a model a budget owns, so it
is also where a handler asks for the active budget itself rather than letting the scoping
extension refuse the read: without one the extension raises an internal error, and a user part
way through onboarding would meet a 500 for an ordinary state. Its read is a hand-written
aggregate as well, because a balance is summed from transactions rather than stored, and that
same aggregate decides three of its writes: an opening balance takes a correction only while
the account holds nothing else, an account is archived only while it holds nothing at all, and
a reconciliation takes the amount it writes from the balance it just summed, so each mutation
locks the account row and counts inside its own transaction. It also owns the one
rule every write path that names an account has to pass, `refusalOfAccounts` in
[`src/accounts/open-accounts.ts`](src/accounts/open-accounts.ts): an account that is gone or
archived takes no write, and the rows it judges come back under the lock that makes the
judgement hold.
[`src/budget-view`](src/budget-view) is the third shape, a read the extension cannot express at
all: the budget numbers are aggregates over many rows, so they are hand-written SQL through the
raw-SQL repository, which supplies the caller and leaves the budget to the service.
[`src/moves`](src/moves) is a write and nothing else, and it is the only code that **writes**
the `Assignment` table through Prisma; `src/budget-view` reads it, as any aggregate may. The
erase in [`src/me`](src/me) deletes those rows with raw SQL, which the lint restriction cannot
see; [architecture](../../.claude/rules/architecture.md) owns why that one exception stands.
[`src/categories`](src/categories) is the fourth shape, writes that first have to read an
aggregate: hiding a category is refused while it still holds money over any month, so the
mutation locks the rows with `SELECT ... FOR UPDATE` and sums them inside its own transaction.
A move locks the same rows for the same reason, which is what stops the two crossing. Goals
live there too, and they take the same lock for a different reason: a category keeps a history
of them, so a write reads that history and chooses between editing, replacing and closing, and
two writers reading it at once would both insert.
[`src/transfers`](src/transfers) is the fifth shape, one operation over a pair of rows of the
same table: the two legs of a transfer are written, rewritten and deleted inside one mutation.
A rewrite and a removal touch the two existing rows in the order of their row ids, so two edits
of one pair from opposite directions wait for each other instead of deadlocking. The write needs
no such order, because both rows are new and neither is a row anyone else can be holding.

## Endpoints

- `GET /health` checks the DB connection (`SELECT 1` via Prisma). `200` if the DB
  is reachable, `503` if not. Public (see below).
- `GET /me` echoes back the `userId` the guard verified. It is protected and touches no table.
  It exists so that a test can exercise the whole auth chain
  (token → guard → `@CurrentUserId()`) over HTTP, with no query in the way.
- `POST /me/erase` deletes every row the caller owns, in one transaction, one statement per
  table. Deletion is physical and nothing undoes it. It reaches every budget the caller has
  rather than the active one, which is why it is raw SQL rather than the scoped client. The
  account itself is untouched: this API holds no credential that could reach the identity
  provider, so a client that wants the account gone deletes it with the session it already
  has. A repeat under the same key is answered with the first result, and one row survives the
  sweep, the idempotency key that request claimed.
- `GET /user-settings` returns the caller's own settings, today just the interface language.
  It is get-or-create: the first call stores the language read from `Accept-Language` (ru/en/pl,
  anything else → `en`), every later one only reads. A GET that can write is deliberate.
  There is exactly one settings row per user and nothing for a client to decide, so a
  create-then-read handshake would add a round-trip with one possible outcome.
- `PATCH /user-settings` changes the language, and writes the row when the caller has never
  read it. It takes one of the languages the app renders and nothing else, the same three the
  starter categories are written in. The theme is not here. It belongs to the device rather
  than to the account, and never reaches the server.
- `GET /budgets` returns the caller's budgets, oldest first, with the active one marked, each
  carrying the earliest month it can hold, read from when it was created in its own timezone.
  A screen has no month to show before that one, so it stops there. A caller who has not
  created a budget yet gets an empty list rather than an error.
- `GET /budget-view?month=YYYY-MM` returns one month of the categories screen: the groups and
  categories of the active budget with what each holds this month, plus the money that has no
  job yet, and the icon and the colour each category is drawn with. What a month holds is
  computed from transactions and assignments in one statement and cached nowhere; a goal's own
  columns are read from its row, and a goal saving toward a total counts its progress from what
  the envelope carried in when it started, summed the same way. The look is a
  domain name rather than the name of a component, so a category the user has not given one
  answers with null and so does a stored name this app no longer draws. The month is required, because a default would make the answer depend on a
  clock rather than on what the user is looking at. A category or a group hidden later than the
  month asked for is still listed in it, and a hidden one counts in the totals regardless.
  `includeHidden` asks for the hidden rows as well, which changes what is listed and never what
  is counted. Every category also carries what it holds over every month, not only up to the one
  asked for, because that is the amount that has to be zero before it can be hidden. A category
  running a goal in that month also carries it, with what the goal asks of the month and what
  it counts as gathered; a category running none carries null. Which goal a month gets is
  decided by the month rather than by which goal was written last, because a category keeps
  every goal it has run.
- `POST /categories/{id}/target` sets the goal of a category. It starts one, or edits the one
  the category is running. Changing the kind of a goal started in an earlier month closes that
  one and starts a new one, so the history stays; changing the kind of a goal started in this
  month replaces its row. The starting month comes from the budget's timezone and never from
  the caller. What the envelope carried in when the goal started is not written down: the read
  path sums it, so the goal keeps up with a correction to a month before it.
- `POST /categories/{id}/target/close` ends the goal with the month the budget is living in.
  It is still shown in that month and gone from the next one, and the row stays.
- `POST /budgets` creates a budget and, when asked for, the starter groups and categories, each
  carrying an icon and a colour so the screen has something to draw before the user chooses. One
  transaction covers all of it, the language the user picked on that screen included: the
  category names are written in that language, and a second request to store it would leave a
  window where the two disagree. The language stays a property of the user rather than of the budget. The
  currency is chosen here and nowhere else, so no operation in the contract accepts one
  afterwards, and its minor digit count is frozen on the row. A user holds at most one active
  budget, so creating one deactivates the previous.
- `GET /accounts` returns the active budget's accounts, oldest first, each with its balance,
  and what they hold together. Nothing here is stored: a balance is the sum of the account's
  transactions, over every date rather than up to today, and the total covers exactly the
  accounts listed. An archived account is in neither, so the rows always add up to the total.
  Each row also says whether its opening balance still takes a correction, counted over every
  date by the same statement, so a screen knows before it asks rather than by being refused.
- `POST /accounts` creates an account and its opening balance in one transaction. The balance
  is an income transaction dated today in the budget's timezone and carrying no category, so
  the money lands in Ready to Assign. It is written even when the amount is zero, because
  nothing creates it a second time and an account without it would have no opening balance
  ever. A caller with no active budget gets a 400 from both of these rather than a 500, in the
  shape [`BadRequestResponse`](src/openapi/bad-request.response.ts) publishes: it covers the
  pipe's list of field failures and a handler's single sentence alike.
- `PATCH /accounts/:id` renames an account and changes nothing else. The type is chosen when
  the account is created and never afterwards, so no operation in the contract accepts one
  again. An account the active budget does not hold is a 400 rather than a 500.
- `POST /accounts/:id/archive` puts an account away, and only while its balance is exactly
  zero. The sum runs inside the same transaction that writes `archivedAt`, under a lock on the
  account row that every write naming that account has to pass, so a record landing or leaving
  at that moment cannot slip past the check. Which mode each side takes is
  [`refuse-a-write-on-an-aggregate`](../../.claude/skills/refuse-a-write-on-an-aggregate/SKILL.md).
  It is a POST because the idempotency key travels in the body. There is no way back: the contract publishes nothing that clears the
  archive, and from then on the account takes no write of any kind while its history stays
  readable through `GET /transactions?accountId=`. A refusal carries `BALANCE_NOT_ZERO` with
  the amount that blocked it, or `ACCOUNT_ARCHIVED` when it is archived already.
- `PATCH /accounts/:id/opening-balance` corrects the amount the account was created with, and
  takes nothing else: the day it carries and the direction it points in belong to the account,
  so the contract has nowhere to name them. Zero is a valid amount, because an account can be
  opened with a number that was wrong twice. It is refused once the account holds a record of
  its own, a transfer leg included, and from then on a balance that drifted is corrected by
  recording the movements it is missing. The count runs under a lock on the account row inside the same
  transaction as the correction, so a record arriving at that moment is never missed. Refusals
  name a reason: `OPENING_FROZEN`, `BALANCE_NOT_ZERO`, `ACCOUNT_ARCHIVED`, `UNKNOWN_ACCOUNT`,
  `NO_ACTIVE_BUDGET`, which the other account operations answer with too.
- `POST /accounts/:id/reconcile` takes the balance the account really holds and writes the one
  record that makes the book agree with it: a correction for the difference, carrying no
  category, so the money joins or leaves ready to assign the way an income with no envelope
  does. The balance is summed under the same lock and inside the same transaction as the write,
  so a record landing at that moment is counted once rather than twice. Balances that already
  agree are a success that writes nothing, answered with a difference of zero and no
  correction. The declared balance takes any sign, because an account spent past its own money
  holds less than nothing, and the day is not part of the request: a reconciliation is dated
  today in the budget timezone by definition. What it writes is an ordinary record from then
  on, edited and removed through the transaction operations. Refusals name `ACCOUNT_ARCHIVED`,
  `UNKNOWN_ACCOUNT` or `NO_ACTIVE_BUDGET`.
- `POST /transactions`, `PATCH /transactions/:id` and `POST /transactions/:id/delete` are how
  an income or an expense is written, corrected and removed. The amount arrives without a sign
  and the server writes one from the type, so an expense always leaves the account. Deletion is
  physical, and it is addressed with POST because the idempotency key travels in the body.
  Refusals name a reason: `DATE_IN_FUTURE`, `DATE_BEFORE_ACCOUNT`, `CATEGORY_REQUIRED`,
  `CATEGORY_HIDDEN`, `ACCOUNT_ARCHIVED`, `NOT_EDITABLE`, `UNKNOWN_TRANSACTION`,
  `UNKNOWN_ACCOUNT`, `UNKNOWN_CATEGORY`, `NO_ACTIVE_BUDGET`. An opening balance carries
  `NOT_EDITABLE` whatever the change, its amount included, because it is corrected through the
  account it belongs to. A transfer leg carries it for the same reason: both belong to an
  operation of their own.
- `GET /transactions` is the feed, newest day first and, inside a day, the last record entered
  first. It pages by an opaque `cursor` naming the day, the moment and the record, and it
  carries the total of every day it touches. Each total covers the whole day under the same
  filter, so a day split across two pages reads the same on both. Filters are `accountId`,
  `categoryId`, `payee`, `type`, `from` and `to`, and they narrow together. With no account
  named the feed covers the accounts the budget still uses, and an archived one is in none of
  them.
- `GET /transactions/payees` answers with every name a person has typed in this budget, once
  each and in alphabetical order, so a field searches them in the browser rather than asking
  per keystroke. The names the app wrote itself are not among them.
- `POST /transfers`, `PATCH /transfers/:transferId` and `POST /transfers/:transferId/delete`
  move money between two accounts of one budget. A transfer is a pair of legs sharing a
  `transferId`, mirrored, carrying no envelope and no payee, so ready to assign and every
  category are untouched by it. All three operations are addressed by the pair rather than by a
  leg, and each writes both legs in one transaction. Both accounts must be open, and that holds
  for an edit and a removal as well as for the write: deleting a pair whose other end is
  archived would move a closed account's balance with nobody able to correct it. The accounts
  themselves can be changed, which is an ordinary edit. The date is not later than today and
  not earlier than the day the later of the two accounts was opened. Refusals name a reason:
  `SAME_ACCOUNT`, `ACCOUNT_ARCHIVED`, `DATE_IN_FUTURE`, `DATE_BEFORE_ACCOUNT`,
  `UNKNOWN_ACCOUNT`, `UNKNOWN_TRANSFER`, `NO_ACTIVE_BUDGET`.
- `POST /categories`, `PATCH /categories/:id`, `POST /categories/:id/hide`, `/unhide` and
  `POST /categories/reorder` are the category's own operations, and the five under
  `/category-groups` are the group's. No budget operation deletes either: a category is hidden and
  its row, its transactions and its place in every aggregate stay where they were. Hiding is
  refused while the category holds anything over any month, in either direction of the sign, and
  the refusal carries that amount so the screen can name it. A group is hidden with its
  categories in one transaction and only when each of them holds nothing, the already hidden
  ones included, because a category is never left without a group. Refusals name a reason:
  `AVAILABLE_NOT_ZERO`, `ALREADY_HIDDEN`, `GROUP_HIDDEN`, `UNKNOWN_CATEGORY`, `UNKNOWN_GROUP`,
  `NO_ACTIVE_BUDGET`. Hiding what is already hidden is refused rather than repeated: a second
  marker would move the first, and the months that had stopped showing the row would show it
  again.
  A reordering may name fewer rows than the group holds, because the month it came from lists
  only what is visible in it; the rest keep their order behind the named ones.
- `POST /categories/:id/paid` and `/unpaid` put a mark on the pair of category and month, and
  take it off. The mark says the payment the category stands for is done, it changes no amount,
  and the next month starts without one; what the row is and why it caches nothing is
  [`packages/db`](../../packages/db/README.md). The month view reports it as `paid` on each
  category. Marking what is
  already marked, and unmarking what carries no mark, are answered rather than refused. A hidden
  category is refused with `CATEGORY_HIDDEN`.
- `POST /moves` moves an amount out of one envelope and into another for one month, where Ready
  to Assign is an envelope too. Assigning money is this operation with the pool as the source,
  so nothing else in the contract sets what a category holds. A side names a category or the
  pool, and the category side is the only one that writes: the pool is derived from every
  assignment, so it moves on its own. The domain refuses four things: two sides naming one
  envelope, a category this budget does not hold, a hidden category, and a caller with no
  active budget, who gets the same 400 rather than a 500, the way the account endpoints do.
  Each of the four carries a `reason` beside the message, because a screen answers them
  differently and matching on the prose would break the moment it is reworded. An amount that
  is not above zero is refused earlier, by the pipe, and a body the pipe refuses carries no
  reason at all: it answers before the domain has one to give. What a
  category currently holds is never read, so a move is never
  refused for lack of money and a month's assignment goes negative when last month's leftover
  is handed back.

`PrismaService` connects to Postgres via the `@prisma/adapter-pg` driver adapter
(Prisma 7, Rust-free client); `DATABASE_URL` comes from `ConfigService`.

## The input boundary

Every request body **declared as a DTO class** is validated before a handler sees it. The pipe
is registered globally as `APP_PIPE`
([`src/validation/validation.options.ts`](src/validation/validation.options.ts)), the way the
guard is. An endpoint gets a validated, whitelisted DTO without wiring anything, and a field
the DTO never declared is a 400 rather than something quietly dropped.

⚠️ **The class is the condition, not a detail.** A `@Body()` typed as an interface, as
`Record<string, unknown>` or not at all compiles to the metatype `Object`, and the pipe skips
it. It skips it silently, with `whitelist` and `forbidNonWhitelisted` never running, so
undeclared fields reach the handler and nothing reports it. This is the request-side twin of
the trap below, where a response typed as an interface publishes no schema. Both have the same
cause. An interface leaves no metadata after compilation.

`class-validator` + `class-transformer` rather than zod. The response classes already carry
`@ApiProperty`, so a DTO validated by decorators is the same metadata model rather than a
second one beside it.

**Money is declared `string`**, in request DTOs and response classes alike, with
[`@ApiMoneyProperty()`](src/validation/money.decorator.ts). That one decorator both publishes
the field as a string with its `pattern` and refuses anything that is not integer minor units.
There is no `@nestjs/swagger` CLI plugin here, so a validation decorator contributes nothing to
the spec on its own; declaring the two separately is how a contract and its guard drift apart.
The conversion to `bigint` stays explicit, at `serializeMoney` / `parseMoney` in the service,
and never a global interceptor, which would make the code say one thing and the published
schema another. The decorator's `sign` option moves the published pattern and the pipe's
together, so an amount that may not go below zero (`nonNegative`) or one that would move
nothing at zero (`positive`) states that bound once; `test/money-boundary.spec.ts` is what
proves both halves move.

**A currency, a time zone, a calendar day, a calendar month and a category's look are declared
the same way**, with [`@ApiCurrencyProperty()`](src/validation/currency.decorator.ts),
[`@ApiTimeZoneProperty()`](src/validation/timezone.decorator.ts),
[`@ApiCalendarDateProperty()`](src/validation/date.decorator.ts),
[`@ApiCalendarMonthProperty()`](src/validation/month.decorator.ts),
[`@ApiCategoryIconProperty()`](src/validation/icon.decorator.ts) and
[`@ApiCategoryColorProperty()`](src/validation/color.decorator.ts). Each publishes the field and
refuses a value the app cannot use, in one decorator, for the reason above. A day carries the
shape in the schema and the calendar in the pipe, so `2026-02-30` is refused although it reads
like a date. The month lands on a `@Query()` DTO as readily as on a body, and the same global pipe validates both. The range it
takes is narrower than what a month can be, and
[`@rondo/types`](../../packages/types/README.md) owns both the range and the reason. What a currency
publishes is the **shape** of a code and not the list of them: the codes come from the
runtime's own currency data, so publishing them would let a runtime upgrade rewrite the
committed contract and fail the gate on a change that touches no currency. The codes are owned
by [`@rondo/types`](../../packages/types/README.md) and enforced at the validator. Keeping them
out of the published contract is what leaves them free to move with the runtime.

## The contract (F1.4)

The API describes itself, and everything downstream is generated from that description
(ADR-002). Nothing is hand-written twice.

```bash
pnpm openapi                              # → apps/api/openapi.json (builds the api first)
pnpm --filter @rondo/api-client codegen   # → packages/api-client/src/generated
```

Both are printed here to say what the chain _is_. Running them by hand is not part of the
workflow (F1.5). The pre-commit hook runs them and stages the result, or refuses the commit
when the contract moved and the sources behind it are not all staged. The CI gate re-runs
them and fails if that changes anything; `codegen.sh` at the repository root is the one
definition both callers share.

- **Generation needs neither a server nor a database.** The script boots the compiled app in
  Nest's _preview_ mode ([`src/openapi/generate.ts`](src/openapi/generate.ts)), which wires the
  module graph and the controller prototypes without constructing a single provider. That is
  all the Swagger scanner reads. So `PrismaService` never runs, `DATABASE_URL` is never
  demanded, and the CI step that regenerates the contract needs no connection string. Dropping
  preview mode quietly reintroduces all three; `test/openapi.spec.ts` lives in the **unit**
  suite for that reason.
- **A handler gets into the spec** through a response class with `@ApiProperty`, named in the
  handler's success decorator; see
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md), which owns which
  decorator that is. An interface produces an endpoint with no documented shape at all.
- **`@Public()` also opens the endpoint in the spec.** It stamps the `x-public` extension, and
  [`buildOpenApiDocument`](src/openapi/document.ts) clears the document-wide bearer requirement
  wherever it finds one. There is no decorator that can express "no security" directly.
  `@ApiSecurity` only appends, and the scanner drops an empty requirement before it
  reaches the document.
- **Swagger UI is served everywhere except production**, at `/docs`. Swagger mounts it through
  the HTTP adapter rather than as a controller, so the global guard never sees those routes.
  Wherever it is on, it is on for everyone. The spec itself is not a secret (the repository is
  public, ADR-003); what production withholds is an anonymous "Try it out" console pointed at
  real data.

| Variable   | Meaning                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV` | `development` (the default when unset), `test` or `production`. Only these three; anything else refuses to boot rather than guess. It decides whether `/docs` is served, and **the Docker image sets `production` itself**, so a deployment that wants the docs sets the variable explicitly (see [deploy-railway.md](../../docs/deploy-railway.md)). |

## Authentication (F1.2)

Every request carries a Clerk session token as `Authorization: Bearer <jwt>`.
[`ClerkAuthGuard`](src/auth/auth.guard.ts) verifies its signature with
[`verifyToken()`](https://clerk.com/docs/guides/sessions/manual-jwt-verification) and puts
the `sub` claim on the request as `userId`; anything missing, malformed, expired or signed
by someone else is `401`, with no hint in the body about which of those it was.

- The guard is registered **globally** ([`AuthModule`](src/auth/auth.module.ts) →
  `APP_GUARD`), so a new endpoint is protected without anyone remembering to protect it.
  Opening one is an explicit [`@Public()`](src/auth/public.decorator.ts) on the handler or
  the controller. That is how `GET /health` stays reachable for Railway's anonymous probe.
- Handlers read the caller with [`@CurrentUserId()`](src/auth/current-user.decorator.ts).
  **This is the only source of identity.** A `userId` taken from the body, the query or a
  header is a request to read someone else's money, and with no RLS behind us (ADR-005)
  nothing further down would catch it.
- The token must also have been minted **for this app**. `verifyToken()` is configured with
  `authorizedParties`, so the `azp` claim has to equal `WEB_ORIGIN` (F1.3, closing a
  carry-over from F1.2). This is Clerk's standard defence against a token leaked to another
  subdomain being replayed here. If a real browser token ever answers 401, that is the check
  talking. The guard's debug log names the claim and the value it expected; fix `WEB_ORIGIN`
  rather than dropping the check.

### Configuration

| Variable           | Meaning                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_KEY`    | the instance's PEM public key. The api checks signatures locally, with no call to Clerk. Wins over the other. |
| `CLERK_SECRET_KEY` | an accepted fallback. It resolves the JWKS from Clerk (cached five minutes). Nothing here uses it; see below. |

One of the two is **required**. With neither, the process exits at startup (`main.ts`)
instead of answering 401 to every caller. **Every environment uses `CLERK_JWT_KEY`**:
locally from `apps/api/.env.local` ([`.env.local.tpl`](.env.local.tpl) via `pnpm
env:setup`), in CI from a repository secret, on Railway from the service's variables. The
api holds no Clerk secret at all. It only ever verifies signatures, and the public key is
enough for that.

⚠️ **Do not switch a deployed api to `CLERK_SECRET_KEY`.** On that path a token whose `kid`
is not already cached costs one outbound request to Clerk, and a miss is never cached. So
forged tokens carrying random `kid`s amplify one-for-one into JWKS fetches until the Clerk
instance is rate-limited and genuine users get 401s. The api logs a warning at startup
whenever it is running that way; keeping every environment on the PEM key is what keeps
that warning worth reading.

## Tenant isolation

There is no row-level security in Postgres (ADR-005), so everything RLS would have guaranteed
is ordinary code here, and code fails silently. The mechanisms that carry it, in order:

1. **The request context.** [`RequestContextService`](src/request-context/request-context.service.ts)
   holds the caller's `userId` in an `AsyncLocalStorage` for the life of one request. A
   middleware opens the scope before any guard runs; the guard fills it from the verified
   token. Nothing reads the identity from a parameter, so no call site can forget to pass it.
   It is mounted on `'{*splat}'`. Express 5 parses routes with path-to-regexp v8, where a bare
   `*` throws and `'*splat'` misses the root, so the braces are what cover `/`.
   The same store carries the caller's active `budgetId`, and it is
   [`activeBudgetResolver`](src/prisma/active-budget.resolver.ts) that fills it in, on the
   first query that needs a budget rather than on every request. A request that reads nothing a
   budget owns therefore issues no budget query, which is why `GET /me` answers without
   touching the database. What is memoised is the promise rather than its value, so two reads
   running side by side ask once. And what is memoised is the **answer**, never the absence: a
   caller who has no budget yet is looked up again by the next query that needs one, which is
   what lets a request create its first budget and then read something that budget owns. Inside
   a mutation the lookup runs on that mutation's own transaction, so it sees what the
   transaction has written, and a budget it resolved there is forgotten again if the
   transaction rolls back. Reading it returns `undefined` instead of throwing, because a user
   creating their first budget has none yet, and the request that creates it must still work. It asks for a
   single unique row rather than choosing among several. The schema is what makes that safe;
   see [`packages/db`](../../packages/db/README.md).
2. **The auto-scoped client.** Inject `SCOPED_PRISMA`
   ([`scoped-prisma.ts`](src/prisma/scoped-prisma.ts)), not `PrismaService`. The extension
   filters reads of a registered model by the caller and stamps writes with the same id, and an
   operation it has no rule for (`groupBy`, `aggregate`) is **refused unless the caller scoped
   it explicitly**; see [`user-scoping.extension.ts`](src/prisma/user-scoping.extension.ts).
   `PrismaService` itself is the unscoped client underneath; where it may be imported is a lint
   rule, and the list lives in [security](../../.claude/rules/security.md).
   - A model a budget owns is filtered by `budgetId` too, on reads and on the writes that pick
     out existing rows. Which operations those are, and why the ones that create rows take
     their budget from the payload instead, is in
     [security](../../.claude/rules/security.md).
   - Note on types: a write payload names an owner, and the extension overwrites it with the
     verified caller, which is what makes naming the wrong one harmless. Which of Prisma's two
     write inputs still asks for `userId`, and why the other one must be left alone, is in
     [security](../../.claude/rules/security.md). On a read a caller passes no `userId` at all;
     `SCOPED_PRISMA` adds the filter. That is a property of _this_ client, not permission to
     use another one.
   - Its boundary is in [security](../../.claude/rules/security.md) too: what the extension
     does and does not cover, and what a nested write has to do about it. The domain models
     carry relations, so a nested write is reachable now, and it keeps whatever owner the
     caller put on the nested rows. A transfer's two legs sidestep the question: they are two
     top-level writes inside one mutation, which is the shape the extension does cover.
3. **The registry.** [`scoped-models.ts`](src/prisma/scoped-models.ts) classifies every model
   in the schema: everything scoped to a user, the subset a budget owns, and the ones only a
   mutation may write. A new table joins each set it belongs to in the same change that creates
   it.
   [`test/scoped-models.spec.ts`](test/scoped-models.spec.ts) catches a forgotten one by
   walking the schema and failing when a model with a `userId` or `budgetId` column is missing
   (the CI gate).
   `.claude/hooks/stop-scoping-drift.sh` flags it earlier (a reminder, in Claude Code sessions
   only).
4. **Raw SQL in one place.** The extension covers the model API only; `$queryRaw` /
   `$executeRaw` bypass it entirely. They live in [`src/raw-sql`](src/raw-sql):
   [`ScopedRawRepository`](src/raw-sql/scoped-raw.repository.ts) hands the statement builder a
   scope taken from the request context (no context → it throws before any SQL is sent), and
   [`DatabaseProbe`](src/raw-sql/database-probe.ts) holds the one deliberately unscoped query,
   the healthcheck's `SELECT 1`. Everywhere else the restriction `prisma-raw`, composed into
   `@rondo/config/eslint/tenant-isolation`, fails the gate, and there are no inline exemptions.
   The scope it hands out carries the caller and nothing else, so an aggregate over a model a
   budget owns adds the budget itself; how one is written is
   [`aggregate-query`](../../.claude/skills/aggregate-query/SKILL.md).

5. **The single write point.** A write to a guarded model is refused unless it is inside
   [`MutationService.run`](src/mutations/mutation.service.ts), which puts the whole user
   operation and its idempotency key in one transaction. The marker lives in the request
   context and the extension checks it, so the rule holds against a caller who never read it.
   Being inside the call is not enough: the work also has to use the client the mutation handed
   out. `SCOPED_PRISMA` is what domain code injects and `MUTATOR_PRISMA` is what the mutation
   opens its transaction from; which operations the first one refuses, and the lint rule that
   keeps the second out of domain code, are in
   [security](../../.claude/rules/security.md).
   `MUTATION_GUARDED_MODELS` in [`scoped-models.ts`](src/prisma/scoped-models.ts) says which
   models it covers, and the exemption list beside it holds the two the mutator does not force
   itself on: a user's settings, whose row their own first read creates, and the idempotency
   key, which the mutation service writes on its own transaction. Being exempt does not bar
   them from a mutation, which [architecture](../../.claude/rules/architecture.md) states. A new
   model has to be classified before
   its tests pass. What the raw path may do inside a
   mutation, and what it refuses, is in [security](../../.claude/rules/security.md).

What none of this can prove is that a raw statement actually _uses_ the scope it was given;
that is what the cross-tenant tests are for, on every phase that adds an aggregate.

## Running

```bash
pnpm dev --filter=@rondo/api     # the api and the package watchers (see The dev loop, below)
pnpm --filter @rondo/api build   # nest build → dist/
pnpm --filter @rondo/api start   # node dist/main.js
pnpm --filter @rondo/api test    # jest: unit, then integration (needs the local Postgres)
pnpm openapi                     # regenerate openapi.json via turbo (builds first; no DB)
```

### The dev loop

Edit `@rondo/types` or `@rondo/db` and the running api picks it up. Three parts, and none is
redundant:

- each package's `dev` is `tsc --watch`, so its `dist` is re-emitted on save;
- this app's `dev` runs the server under `node --watch-path` over those two `dist` directories,
  because nest restarts only on changes inside `apps/api/dist`;
- `turbo.json` attaches the two watchers to `@rondo/api#dev` with `with`, so any way of
  starting the api **through turbo** starts them too.

`--watch-path` names `dist` rather than the package. A package directory also holds `src`, and
node would restart twice on a source edit, once before the watcher had re-emitted and once
after.

**Start the api through turbo**, never `pnpm --filter @rondo/api dev`. The watch paths must
exist before the server starts, and the `dev` task's `^build` is what produces them, from the
cache too, since the builds declare their output. The direct spelling refuses rather than
failing inside node, because a `predev` step checks both paths and says what to run instead.
`prisma generate` is watched by nothing, so a migration still ends with a generate. See
[`packages/db/README.md`](../../packages/db/README.md).

`DATABASE_URL` comes from the root `.env` (see `.env.example`) and the Clerk key from
`apps/api/.env.local`; on Railway both come from real environment variables, which take
precedence over any file. The port comes from `PORT` (defaults to `3000`).

`WEB_ORIGIN` names the browser client and now carries two exact-match jobs: CORS is scoped to
it, and a session token is accepted only if its `azp` claim equals it. Consequences worth
knowing before a deploy:

- **the api refuses to start without it** (`assertWebOriginConfigured`, called from `main.ts`),
  because the alternative is a service that passes its anonymous healthcheck and 401s every
  real caller;
- a _wrong_ value, such as a trailing slash or `http` for `https`, cannot be caught that way,
  and shows up as 401 everywhere with no CORS error to point at it;
- the `http://localhost:3001` fallback exists for specs, which build the app through
  `Test.createTestingModule` and never pass through `main.ts`.

## Tooling

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `experimentalDecorators`
  / `emitDecoratorMetadata` and `module: nodenext` (resolves as CommonJS, since the package has
  no `"type": "module"`). SWC does the actual build (`.swcrc`); `tsc` is typecheck only.
- **`@/` alias at runtime:** SWC rewrites `@/*` into relative paths at build time
  (`jsc.baseUrl` + `jsc.paths`); in tests, Jest's `moduleNameMapper` does it.
- **Type-aware ESLint:** `@rondo/config/eslint/type-checked` is enabled with
  `no-floating-promises` / `no-misused-promises`, which are critical for atomic mutations.
