---
description: Turn a ticket into an ordered, file-scoped implementation plan. Plans only — writes no code.
argument-hint: '<F1.x ticket, or a task description>'
---

# Plan

Decompose the task into steps that name the files they touch, so the implementation never
has to invent structure. **No code is written by this command** — the plan is the
deliverable.

> If the scope is fuzzy, run [`/grill-me`](grill-me.md) first. `/plan` assumes the scope is
> known; given a vague task it will invent constraints and present them as decided.

## Steps

1. **Read the ticket.** For an `F<x>.<y>` argument, pull the Notion ticket (through the
   Notion MCP server when it is connected; otherwise ask the user for the link or the text
   — do not reconstruct a ticket from memory) and read its Goal, Steps and Acceptance
   Criteria in full. Check the ADRs it leans on and any open question it carries — an open
   question is raised with the user, never resolved silently.
2. **Read the ground.** The rules in `.claude/rules/`, the workspace `README.md` of every
   area involved, and at least one existing file per layer you will touch. Structure is
   copied from what exists, not designed afresh.
3. **Sequence the work** in dependency order: `packages/types` (DTOs) → `packages/db`
   (schema + migration) → `apps/api` → `packages/api-client` → `apps/web` → tests → docs.
   That places the tests last in the _plan_, not in the writing: [`/tdd`](tdd.md) writes them
   first, per layer, and [testing](../rules/testing.md) prefers that order.
4. **Name the cross-cutting concerns** the change actually touches: tenant scoping and
   whether raw SQL is involved (ADR-005), the single write point, money as `bigint`,
   calendar dates, i18n strings, invariant 5.5.
5. **Say what is out of scope** — in particular anything belonging to a later phase.

## Output

```markdown
## Goal

<one sentence: what the app does differently when this is done>

## Steps

1. `<path>` — <what changes, one line>
   - Follows: `<existing file or pattern to copy>`
2. ...

## Cross-cutting

- Scoping: <userId/budgetId — auto-scoped, or raw SQL through the context repository>
- Money / dates: <bigint minor units, calendar dates — or n/a>
- Migration: <name, or none>

## Tests

- `<path>` — <what it proves>
- Cross-tenant / invariant 5.5: <required here? why>

## Docs to correct

- `<path>` — <which sentence goes stale>

## Open questions

- <question — recommendation — needs the user's decision>

## Out of scope

- <deliberately excluded, with the phase that owns it>
```

Steps are file-scoped and numbered: "update the API" is not a step. Stop after presenting
the plan — implementation starts when the user says so.

$ARGUMENTS
