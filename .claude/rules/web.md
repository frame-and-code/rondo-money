---
paths:
  - 'apps/web/**'
  - 'packages/ui/**'
  - 'packages/api-client/**'
---

# The web app

How a screen reaches the API and where its look comes from. Loaded only while work touches
`apps/web`, `packages/ui` or `packages/api-client`.

## One API path

The client is configured once, in `ApiProvider`
([`apps/web/src/lib/api/client.tsx`](../../apps/web/src/lib/api/client.tsx)): base URL, Clerk
token, TanStack Query cache, nothing else. A page or a component never touches a token, a
header or a base URL, and never writes `fetch`.

- Client components read through the generated query options from
  `@rondo/api-client/react-query`: `useQuery(xxxOptions())`. The token attaches itself from the
  `security` the operation declares in the spec, so what decides is `@Public()` in `apps/api`.
  Setting `Authorization` by hand means the endpoint is mis-declared; fix the declaration.
- Server components and route handlers never use the module-level client. It is one client per
  process, so configuring it on the server would share one visitor's token across concurrent
  requests. `ApiProvider` configures it in the browser only. Server code that needs the API
  builds its own client per request from `await auth()` and passes it explicitly (`{ client }`
  on the generated call), in `src/lib/api`, and never a bare `fetch`.
- A missing endpoint is added to `apps/api` and regenerated, never assembled out of a URL.
- Mutations invalidate through the generated query keys, never a hand-written literal. Expect
  the invalidation to be wide: one assignment moves ready to assign and every later month's
  Available. A change of the active budget re-reads everything through `readAnotherBudget`
  beside the gate, which resets every query except the two the gate reads (invalidated) and
  the user's settings (left alone); resetting the gate's reads would strand it.
- An idempotency key belongs to the user's intent and is minted once when the form opens, not
  per request. [`edit-money-on-a-screen`](../skills/edit-money-on-a-screen/SKILL.md) holds the
  rest of what a money field does.
- Money arrives as a string; the helpers in `@rondo/types` parse it. Never do arithmetic on
  the raw value. DTOs come from `@rondo/types`.

## Where a screen's look comes from

A screen is not designed twice. When the ticket carries a design, the design is the
specification.

1. Open every artboard before writing the screen: copy, field order, states, responsive
   behaviour all come from it, and the artboards win over any prose. Where the design and a
   recorded decision conflict, the user decides.
2. Icons come from `@tabler/icons-react`. Never paste a raw `<svg>`; match the path data to the
   icon and import it by name.
3. Before writing a screen, write the plan of its controls out loud, one line per control:
   what it is, which artboard and width it comes from, which primitive from `packages/ui` it is
   built from. A control with no primitive beside it is the one about to be hand-rolled. A
   picker of a value is `Select` or `Combobox`, never `DropdownMenu`, which is a menu of
   actions; the double chevron means "choose", the single one "expand".
4. Look for the component in this order: `packages/ui`, the shadcn registry
   (`pnpm dlx shadcn@latest add <component>` into `packages/ui`, which stops for
   confirmation), then a composition of primitives. Never bare markup: the lint rule
   `@rondo/config/eslint/ui-primitives` fails on a bare form control and names the primitive to
   use. Reuse the tokens the neighbouring primitive carries rather than values that look close.
5. Tailwind utilities and shadcn/ui components only. No hand-written CSS files and no bespoke
   re-implementation of a primitive shadcn/ui ships. An inline `style` is allowed for one thing:
   a value computed per element at runtime, such as an animation delay from a cell's position.
   A colour, a size or a spacing never is, because Tailwind's scanner reads the source and a
   class assembled from a variable was never generated. A custom animation goes in `@theme` in
   [`globals.css`](../../apps/web/src/app/globals.css).
6. No hardcoded UI strings. They go through `src/i18n` (ru, en, pl; en is the fallback) from
   the first line, and `useTranslations()` resolves the locale. `rondo/no-ui-literals` fails
   the gate on text in JSX and on a literal label, placeholder or title. A phrase with a number
   whose word bends with it goes into the plural dictionary and is read with `tn()`; a
   `{{count}}` inside a plain key is right in one language and wrong in the next. A component
   in `packages/ui` takes its text as a prop, never in English of its own.

### Colour on an amount

On the budget screens an amount below zero is `text-destructive` and no other amount carries a
colour. What belongs to a red amount reddens with it (the explanation under ready to assign,
the spend ring of an overspent tile); a group's total stays plain. A tile greys an amount at
zero and leaves one above zero plain; the move rows rest muted. A pair of amounts does not grey
its zero. Ready to assign is the one amount with its own colour above zero, `text-primary` with
`dark:text-chart-2`; below zero it is red like the rest. A category's ring keeps the category's colour and turns red only on an
overspent envelope.

A glyph may carry a colour an amount may not: the badge in the assigned row is `warning` while
the month is short of its goal and `success` once covered, and it never spreads to a number.
A frame or a dimming says something about a card, never about an amount: `ring-warning/45` only
while the screen is filtered to the categories below zero, reduced opacity for a category
closed for the month with a `success` check and screen-reader text, drawn behind the open
ones without moving in the stored order, so a drop is written back through `storedOrder` and
never as the order shown, `ring-destructive/45` for a
save that failed. Every colour is a theme token.

Two screens stop that rule. On money flow an expense is the ordinary case, so a negative amount
stays plain, money arriving on an account takes `text-success`, and red stays with an account
balance below zero and nowhere else; the record form's kind buttons take the primary,
`success` and `warning` tones so the pressed one is read without its label. On net worth the
total takes the colour of the pool whatever its sign and every amount under it stays plain.

## A route that needs a state of the data is closed by a gate

The gate is one client component in the route group's layout
([`onboarding-gate.tsx`](../../apps/web/src/components/onboarding-gate.tsx)) and the reading
of the state is a plain function beside it ([`lib/onboarding.ts`](../../apps/web/src/lib/onboarding.ts)).
A step may let in more than one answer, and the gate hands the answer that let a visitor in to
what it protects, so a screen reads the verdict and never the query behind it.

- It decides on this mount's own answer. A cached or failed read moves nobody; the gate waits,
  and says the check failed rather than guessing.
- It decides once per route and per user, then holds. What resets the verdict is the step it
  guards changing or the signed-in user changing, never the path.
- It renders nothing it is about to move the user away from. Not the shell, not the form.

A gate is a decision about where a user belongs, not a security boundary. What stops a
request is the API.

## What the reader is looking at lives in the address

A selection a link should reproduce is a route segment or a query parameter, never
`useState`: the month a budget screen shows, the account a feed covers, the budget a new one is
started from. An operation that destroys what the address names moves the reader off it before
the row disappears, with a replacement rather than a push.
