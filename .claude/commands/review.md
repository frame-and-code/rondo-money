---
description: Review the current branch against this project's invariants using parallel reviewers with clean context, then verify each finding before reporting it.
argument-hint: '[branch | #PR | path] (default: this branch against main)'
---

# Review

A review of this repository's own invariants, done by
[`pr-reviewer`](../agents/pr-reviewer.md) subagents rather than by you: scoping, layer
boundaries, the single write point, money, dates, and the tests the DoD requires.

Why subagents and not you? You have been in this session while the code was written, so you
know what it was _meant_ to do, and that is exactly the knowledge that makes a bug invisible.
A subagent starts with **no conversation history**. It gets `CLAUDE.md` and the project
rules, and nothing else, so it reads the change the way a reviewer on the PR will. It also
keeps the reading out of this window: what returns is the findings, not the file dumps.

This does not replace the generic pass (`/code-review`, CodeRabbit, Greptile on the PR). It
is the pass that knows ADR-005 exists.

**Invoking this command _is_ the explicit request to spawn subagents**, whether you type it
or reach it through [`/prep-pr`](prep-pr.md), which calls it at step 5. Say so plainly,
because the opposite reading has cost real reviews. A session may carry a standing
instruction like "do not use subagents unless the user requested it", and an agent that reads
it narrowly does the review itself, reports a weaker pass, and the user finds out afterwards.
Asking for a command whose definition is a fan-out asks for the fan-out; there is no version
of this command that runs without it. This is the same construction
[`/prep-pr`](prep-pr.md) uses for git. Typing the command is the ask. If subagents are
genuinely unavailable in this environment rather than merely discouraged, **say that and
stop**. Never quietly substitute a single-context read and report it as a review.

## Steps

1. **Scope it.** No argument: the branch's own work, committed **and** not, meaning all four
   of `git diff main...HEAD` (three dots: this branch, not main's commits),
   `git diff --cached`, `git diff`, and `git status --porcelain` for untracked files, which
   no diff shows. This command's whole point is to run _before_ the PR, so the usual case is
   work that is staged and not yet committed. Reviewing only `main...HEAD` there reports
   "nothing to review" on a full branch of changes. A branch name: `git diff main...<branch>`.
   A `#N`: `gh pr diff N` **and the PR's own files**, because a reviewer is told to read
   around the diff, and those files resolve against whatever is checked out here, so a diff
   from one state read against another is worse than no review. Give each reviewer the
   contents at the PR head SHA, read without changing the working tree
   (`gh api …/contents/<path>?ref=<sha>`, or `git show <sha>:<path>` once the ref
   is fetched). **Do not check the PR out**: this command changes no files, and a checkout
   replaces the caller's tree with someone else's branch. If that read is unavailable, say
   contextual review is unavailable and stop rather than reporting a review of the wrong tree. A path:
   that path. Print `--stat` so the size of what is being reviewed is visible, and stop only
   when the sources for the target you were given are genuinely empty.
2. **Fan out: one message, four `Agent` calls, `subagent_type: pr-reviewer`.** Parallel
   because they are independent; a second message would serialise them for nothing. Give each
   its dimension and, because it cannot see this conversation, everything it needs to start:
   the diff range or PR number, the branch, the ticket if the branch names one, and any
   finding the user has already overruled, so it is not raised a second time.

   The four below are the default set, and they are shaped for application code. A change
   outside it, such as the agent setup, CI, the hooks or the docs, **substitutes dimensions
   that fit** rather than sending three reviewers to find nothing: for `.claude/` that means
   asking whether the described workflow actually executes, and for a hook whether its rule
   can be evaded. Keep the count at four and keep them disjoint; that is what the parallelism
   buys.
   - **isolation**, ADR-005: `SCOPED_PRISMA` vs `PrismaService`, raw SQL outside
     `ScopedRawRepository`, `userId` sourced anywhere but `@CurrentUserId()`, new models
     missing from `scoped-models.ts`, nested writes assuming scoping, missing cross-tenant
     tests.
   - **boundaries**, ADR-002 / ADR-006: web reaching the database or hand-writing a request
     beside the generated client, the module-level client configured on the server, DTOs
     restated instead of imported, mutations bypassing the single write point, derived state
     given a column, endpoints whose contract says nothing.
   - **correctness**: money as float or hardcoded 2 digits, bigint over the wire as a
     number, `new Date()` instead of the budget's timezone, swallowed exceptions on a money
     path, unvalidated input at the edge, errors leaking internals, the edge cases the tests
     skip (zero, negative, month boundary, future month, duplicate request).
   - **prose**, what this change made false: `README.md`, `docs/*`, workspace READMEs,
     `.claude/` (rules, the tables in [`.claude/README.md`](../README.md), hook and skill
     descriptions), and any
     Notion-owned decision the change supersedes.

3. **Verify before reporting, with one refuter per dimension and not one per finding.**
   Deduplicate first: two reviewers finding the same thing is one finding, and it is assigned
   to **one** dimension, the one whose rule it breaks, so exactly one refuter owns it and no
   claim comes back with two verdicts. Then spawn at most four fresh `pr-reviewer` agents in
   one parallel message, each carrying its dimension's MUST FIX and SHOULD FIX claims and
   asked to **refute** them. The bound is deliberate. A refuter per finding turns a productive
   round into twenty agents re-reading the same files. A claim that somehow reaches no refuter
   is reported as `unproven`, never as confirmed.

   Each verdict opens with a fixed line: `VERDICT:` followed by `confirmed`, `refuted` or
   `unproven` and one clause saying what settled it. Without that line a refuter's "found
   nothing" is unreadable. It could mean the claim collapsed, or that the refuter had nothing
   to add to it.

   **How a claim is refuted depends on what it claims.** A behaviour claim ("this returns
   another user's rows") is refuted by failing to reproduce it. A missing-thing claim ("no
   cross-tenant test", "no `@ApiProperty`", "this sentence in `docs/` is now false") has no
   reproduction to fail. It is refuted only by naming the thing that does exist. Applying the
   reproduction test to those would default them all to refuted by construction, and they are
   the findings this project most needs, since they are what the generic reviewers never
   raise.

   Report confirmed findings, report unproven ones with that label, drop refuted ones.

4. **Print the findings themselves** (shape below), in this window, before anything is
   fixed. "The reviewers found some things and I fixed them" is not a report. The user has
   to see what was found, at what severity and where, or the review may as well not have run.
   The whole value of a second pass is that a human can disagree with it. Each finding keeps
   its `file:line` and its one-line claim; a reviewer's own wording is preserved rather than
   paraphrased into agreement.
5. Then **stop**. This command changes no files and runs no git. Fixing is a separate
   decision and it is the user's, including the decision that a finding is wrong.

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
one ran. And **the fix is where the next bug lives**. This is not theory: the round that
closed a bare `git push` on `main` is the round that left `git push origin HEAD` open, and the
round that closed that one left `+main` open. Each was found by the next round, never by
re-reading the same round's output.

So **run again after fixing, and stop at the first round that produces nothing which changes
the code.** NICE TO HAVE findings are not a reason to go again. Past that point what improves
is the reviewers' taste, not the change. Three rounds is the ceiling; needing a fourth means
the change is too large to review, not that the reviewing is going well.

**For code with an adversarial surface, such as a guard, a parser or a validator, that rule
is wrong and this repository has the scar to prove it.** A reviewer told to find a way past a
guard always finds one, so "stop when a round finds nothing" never fires: eight rounds over
`guard-bash` each produced real bypasses, and the eighth was still finding them. What ends it
is the code's own charter. That guard refuses **accidents**, and its header lists the
deliberate spellings it does not cover, so the stop condition is **"no findings of the class
the code is for"**. An accident still getting through means keep going; another way for
someone determined does not. Write that class down in the code before the first round, or
there is nothing to stop against.

Nothing loops this command, and deliberately so: a round can only follow a fix, and fixing is
not this command's to do. The loop lives one level up. [`/prep-pr`](prep-pr.md) runs a round
before it commits and refuses to open a PR while a MUST FIX or a SHOULD FIX stands, so fixing
and running `/prep-pr` again _is_ the next round. Rounds are therefore automatic exactly where
they matter, and absent when you are only asking what the reviewers think.

And not every change earns a round at all. What earns it is code that can **fail silently**:
a guard, a scoping path, a migration, a mutation, an aggregate. A one-line fix, a copy edit or
a dependency bump does not; running four agents over it costs more attention than it returns,
and a reviewer trained to find something in a trivial diff will.

$ARGUMENTS
