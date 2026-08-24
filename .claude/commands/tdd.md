---
description: 'Build a ticket test-first: derive the scenarios, confirm them, write them red, then implement until green.'
argument-hint: '<F1.x ticket, or a task description>'
---

# TDD

Turn a ticket into failing tests first, and only then into code. The order is the whole
point. [testing](../rules/testing.md) asks for tests that **assert behaviour, not
implementation**, and a test written after the code has no way to tell the two apart. It
mirrors whatever was built, including the misreading. A test written from the ticket
cannot, because the code it would mirror does not exist yet.

> This command writes code, unlike [`/plan`](plan.md). It assumes the scope is known; given a
> fuzzy ticket it will invent scenarios and present them as agreed. Run
> [`/grill-me`](grill-me.md) first when the scope is fuzzy, and [`/plan`](plan.md) first when
> the change spans layers and the file structure is not obvious. `/tdd` covers the
> implementation loop, not the decomposition.

## Steps

1. **Read the ticket and the ground.** Pull the Notion ticket (through the Notion MCP server
   when it is connected; otherwise ask the user for the link or the text, and never
   reconstruct one from memory) and read its Acceptance Criteria in full, plus the ADRs it
   leans on. Then read the ground the tests will stand on: [`docs/testing.md`](../../docs/testing.md)
   for levels, layout and prerequisites, and **at least one existing test per level you will
   touch**. Name the files you read. An open question in the ticket goes to the user
   ([model integrity](../rules/model-integrity.md)); it never becomes a scenario that quietly
   picks an answer.

2. **If the ticket carries a design, open it now.** Duplicated here from
   [architecture](../rules/architecture.md), which owns it, because skipping it costs a rebuild
   of the whole screen and every test written against it:
   - the design is the specification, and a plan describing it is a summary rather than a
     replacement. Read every artboard and take the copy, the fields, their order, the states
     and the responsive behaviour from there;
   - icons come from `@tabler/icons-react`, matched to the mock's paths by name. Never paste a
     raw `<svg>` out of a mock;
   - before building a component, look in `packages/ui`, then in the shadcn registry
     (`pnpm dlx shadcn@latest add <component>`), which generates it with this project's
     settings;
   - only if it is in neither, compose it from the primitives, never from bare markup.

   A scenario written against a screen you invented passes against that invention.

3. **Derive the scenarios as prose, not as code.** One line each: what it proves, at which
   level, in which file. What governs the list:
   - **every Acceptance Criterion maps to at least one scenario**, and the list says which.
     An AC with no scenario is either out of scope or a gap, and both need saying out loud;
   - levels follow `docs/testing.md`: most coverage in unit, integration for what only a real
     Postgres can prove (scoping, transactions, idempotency), one or two e2e per feature. A
     ticket that changes a blocking hook has a fourth surface instead: cases in
     [`hooks.test.sh`](../hooks/hooks.test.sh), run with `pnpm test:hooks`, since `.claude` is
     not a workspace and no `--filter` reaches it;
   - the **mandatory** ones are listed even when they feel obvious: cross-tenant for any phase
     that adds domain tables and for every raw aggregate, invariant 5.5 (property-based, over
     all-time aggregates) for anything that moves money, and a regression test for every bug
     fix, the one that fails before the fix;
   - name the edges rather than implying them: zero, negative, the month boundary, a future
     month, a duplicate request, a currency whose minor digits are not 2;
   - say what is **deliberately not covered**, and who owns it.

4. **Stop and get the list confirmed.** This is a hard gate. No test file is created before
   the user answers. A scenario list is the cheapest place to fix a misunderstanding. Once
   the tests exist it costs a rewrite, and once the feature exists it costs an argument.

5. **Write them red, and prove the red.**
   - Write only the scenarios that were confirmed, copying the structure of the example file
     named in step 1.
   - Add the **least production code that lets the test compile and run**: a signature, a
     module registration, a `throw new Error('not implemented')`. Not the behaviour. A red
     phase that cannot even execute is a broken test, not a failing one.
   - Run them and **quote the failure**. Each test must fail on its own assertion, or on that
     deliberate throw. A failure on a typo, a missing import or `MODULE_NOT_FOUND` is your
     bug, and it is fixed before this step ends.
   - **A test that passes here is a defect.** Either it asserts nothing, or the behaviour
     already exists. Say which, then fix it or drop it; never leave it as a green passenger.
   - Check what actually ran. `apps/api`'s `test:unit` carries `--passWithNoTests`, and a
     filter that matched no files reports success while proving nothing.
   - Bring the level's prerequisites up first, or the red is about the environment rather than
     the code. They are listed in [`docs/testing.md`](../../docs/testing.md). E2E is the level
     to run once at the end rather than every round.

6. **Implement to green, one scenario at a time.**
   - Take them in dependency order, `packages/types` → `packages/db` → `apps/api` →
     `packages/api-client` → `apps/web`, the same order [`/plan`](plan.md) sequences work in.
   - The smallest change that turns the current test green, then re-run **that level**, the
     one step 3 assigned the scenario, not whichever is quickest. The commands differ and the
     wrong one lies. `pnpm --filter @rondo/api test:unit` ignores `*.integration.spec.ts` by
     config while the other specs still pass, so an integration scenario run that way reports
     green having never executed. Integration is
     `pnpm --filter @rondo/api test:integration`. Prefer the turbo spelling
     (`pnpm test:unit --filter=<workspace>`) when a dependency changed in the same round.
     `pnpm --filter` runs the package script directly, with no `^build`, and `apps/api` resolves
     `@rondo/types` through its `dist`, so without a `pnpm dev` watcher up, the run judges the
     previous build. The full gate belongs at the end, not in every iteration.
   - Re-run the already-green scenarios each round. One that goes red again is a regression
     you just wrote. Say so when it happens, rather than repairing it quietly before the
     report.
   - A level can exit non-zero with every test passing. The coverage thresholds in
     [`docs/testing.md`](../../docs/testing.md) fire mid-loop, while the scenarios that would
     cover the new code are still unwritten. That means the next test, never a lower threshold
     and never a deleted stub.
   - **Never edit a test to make it pass.** If a test turns out to be wrong, stop. Say what it
     asserted, why the behaviour it demands is wrong, and what it should assert instead, then
     let the user decide. Silently relaxing an assertion is the single failure that makes this
     whole command worthless.
   - The rules do not pause for the red-green loop. Green reached by reaching around
     `SCOPED_PRISMA`, by storing a derived value, by splitting one user operation across two
     transactions or by treating money as a number is not green. It is a test that now
     certifies a violation.

7. **Refactor on green.** The net exists now, so use it: naming, duplication, the shape the
   tests just made obvious. Re-run after each step. Anything that changes behaviour is not a
   refactor. It goes back to step 3 as a new scenario.

8. **Close out.** [`/check`](check.md) for the full gate, and the documentation the feature
   made false is corrected in this same change ([`/sync-docs`](sync-docs.md)). The ticket's
   remaining DoD is [`/phase-done`](phase-done.md), and the PR is [`/prep-pr`](prep-pr.md).

## Output

The scenario list, at step 4, in this shape:

```markdown
## Scenarios: <ticket>

### Unit: `<path>`

1. <what it proves>, covers AC <n>

### Integration: `<path>`

1. <what it proves>, covers AC <n>

### Mandatory here

- Cross-tenant: <required, why / not applicable, why>
- Invariant 5.5: <required, why / not applicable, why>

### Not covered

- <what>: <why, and the phase or ticket that owns it>
```

Then, after step 6, a report:

- each scenario with its red → green transition and the run that proved it;
- anything still red, and why, never a silent skip;
- any scenario dropped or reworded after the confirmation, with the reason;
- what the gate actually ran and said ([model integrity](../rules/model-integrity.md)). A
  turbo cache hit is a replay, not a run.

$ARGUMENTS
