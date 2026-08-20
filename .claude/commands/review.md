---
description: Review the current branch against this project's invariants using parallel reviewers with clean context, then verify each finding before reporting it.
argument-hint: '[branch | #PR | path] (default: this branch against main)'
---

# Review

A review of this repository's own invariants — scoping, layer boundaries, the single write
point, money, dates, the tests the DoD requires — done by
[`pr-reviewer`](../agents/pr-reviewer.md) subagents rather than by you.

Why subagents and not you: you have been in this session while the code was written, so you
know what it was _meant_ to do, and that is exactly the knowledge that makes a bug invisible.
A subagent starts with **no conversation history** — it gets `CLAUDE.md` and the project
rules, and nothing else — so it reads the change the way a reviewer on the PR will. It also
keeps the reading out of this window: what returns is the findings, not the file dumps.

This does not replace the generic pass (`/code-review`, CodeRabbit, Greptile on the PR). It
is the pass that knows ADR-005 exists.

## Steps

1. **Scope it.** No argument: the branch's own work, committed **and** not — all four of
   `git diff main...HEAD` (three dots: this branch, not main's commits), `git diff --cached`,
   `git diff`, and `git status --porcelain` for untracked files, which no diff shows. This
   command's whole point is to run _before_ the PR, so the usual case is work that is staged
   and not yet committed: reviewing only `main...HEAD` there reports "nothing to review" on a
   full branch of changes. A branch name: `git diff main...<branch>`. A `#N`: `gh pr diff N`,
   and say in the report that the reviewers read that diff against the local tree — the files
   around it are this checkout's, not the PR's, unless the PR is checked out first. A path:
   that path. Print `--stat` so the size of what is being reviewed is visible, and stop only
   when the sources for the target you were given are genuinely empty.
2. **Fan out — one message, four `Agent` calls, `subagent_type: pr-reviewer`.** Parallel
   because they are independent; a second message would serialise them for nothing. Give each
   its dimension and, because it cannot see this conversation, everything it needs to start:
   the diff range or PR number, the branch, the ticket if the branch names one, and any
   finding the user has already overruled, so it is not raised a second time.

   The four below are the default set, and they are shaped for application code. A change
   outside it — the agent setup, CI, the hooks, the docs — **substitutes dimensions that fit**
   rather than sending three reviewers to find nothing: for `.claude/` that means asking
   whether the described workflow actually executes, and for a hook whether its rule can be
   evaded. Keep the count at four and keep them disjoint; that is what the parallelism buys.
   - **isolation** — ADR-005: `SCOPED_PRISMA` vs `PrismaService`, raw SQL outside
     `ScopedRawRepository`, `userId` sourced anywhere but `@CurrentUserId()`, new models
     missing from `scoped-models.ts`, nested writes assuming scoping, missing cross-tenant
     tests.
   - **boundaries** — ADR-002 / ADR-001: web reaching the database or hand-writing a request
     beside the generated client, the module-level client configured on the server, DTOs
     restated instead of imported, mutations bypassing the single write point, derived state
     given a column, endpoints whose contract says nothing.
   - **correctness** — money as float or hardcoded 2 digits, bigint over the wire as a
     number, `new Date()` instead of the budget's timezone, swallowed exceptions on a money
     path, unvalidated input at the edge, errors leaking internals, the edge cases the tests
     skip (zero, negative, month boundary, future month, duplicate request).
   - **prose** — what this change made false: `README.md`, `docs/*`, workspace READMEs,
     `.claude/` (rules, this command's own table, hook and skill descriptions), and any
     Notion-owned decision the change supersedes.

3. **Verify before reporting — one refuter per dimension, not one per finding.** Deduplicate
   first: two reviewers finding the same thing is one finding, and it is assigned to **one**
   dimension — the one whose rule it breaks — so exactly one refuter owns it and no claim
   comes back with two verdicts. Then spawn at most four fresh `pr-reviewer` agents in one
   parallel message, each carrying its dimension's MUST FIX and SHOULD FIX claims and asked to
   **refute** them. The bound is deliberate — a refuter per finding turns a productive round
   into twenty agents re-reading the same files. A claim that somehow reaches no refuter is
   reported as `unproven`, never as confirmed.

   Each verdict opens with a fixed line — `VERDICT:` followed by `confirmed`, `refuted` or
   `unproven` and one clause saying what settled it. Without that line a refuter's "found
   nothing" is unreadable: it could mean the claim collapsed, or that the refuter had nothing
   to add to it.

   **How a claim is refuted depends on what it claims.** A behaviour claim ("this returns
   another user's rows") is refuted by failing to reproduce it. A missing-thing claim ("no
   cross-tenant test", "no `@ApiProperty`", "this sentence in `docs/` is now false") has no
   reproduction to fail — it is refuted only by naming the thing that does exist. Applying the
   reproduction test to those would default them all to refuted by construction, and they are
   the findings this project most needs, since they are what the generic reviewers never
   raise.

   Report confirmed findings, report unproven ones with that label, drop refuted ones.

4. **Print the findings themselves** (shape below), in this window, before anything is
   fixed. "The reviewers found some things and I fixed them" is not a report — the user has
   to see what was found, at what severity and where, or the review may as well not have run:
   the whole value of a second pass is that a human can disagree with it. Each finding keeps
   its `file:line` and its one-line claim; a reviewer's own wording is preserved rather than
   paraphrased into agreement.
5. Then **stop**: this command changes no files and runs no git. Fixing is a separate
   decision and it is the user's — including the decision that a finding is wrong.

## Report

```markdown
## Review — <range>, <n> files

### MUST FIX

1. **<claim>** — `file:line`
   <what happens, and the rule or ADR it breaks>
   Fix: <the smallest change>

### SHOULD FIX

<same shape, or "none". Kept apart from what follows because it blocks: `/prep-pr` does not
commit while one stands>

### NICE TO HAVE

<same shape, or "none". These ship>

### Checked and clean

- <dimension> — <what was examined and found sound>

### Not covered

- <anything the reviewers could not verify from the diff — a manual check, a running
  environment, a decision that is the user's>
```

Report an empty review as an empty review. A round that finds nothing real is the expected
outcome of a careful change, and inventing a NICE TO HAVE to fill the section is how a
reviewer teaches its reader to skip it.

## How many rounds, and on what

Fixing changes the code, so a second round reads something that did not exist when the first
one ran — and **the fix is where the next bug lives**. This is not theory: the round that
closed a bare `git push` on `main` is the round that left `git push origin HEAD` open, and the
round that closed that one left `+main` open. Each was found by the next round, never by
re-reading the same round's output.

So: **run again after fixing, and stop at the first round that produces nothing which changes
the code.** NICE TO HAVE findings are not a reason to go again — past that point what improves
is the reviewers' taste, not the change. Three rounds is the ceiling; needing a fourth means
the change is too large to review, not that the reviewing is going well.

Nothing loops this command, and deliberately so: a round can only follow a fix, and fixing is
not this command's to do. The loop lives one level up — [`/prep-pr`](prep-pr.md) runs a round
before it commits and refuses to open a PR while a MUST FIX or a SHOULD FIX stands, so fixing
and running `/prep-pr` again _is_ the next round. Rounds are therefore automatic exactly where
they matter, and absent when you are only asking what the reviewers think.

And not every change earns a round at all. What earns it is code that can **fail silently** —
a guard, a scoping path, a migration, a mutation, an aggregate. A one-line fix, a copy edit or
a dependency bump does not; running four agents over it costs more attention than it returns,
and a reviewer trained to find something in a trivial diff will.

$ARGUMENTS
