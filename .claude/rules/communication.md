# Communication

## Language

Everything that goes into git — code, comments, docs, scripts, commit messages, PR text —
is written in **English**: the project is public, and anyone may read it. A few older files
still carry Russian comments; do not imitate them, and translate them when you touch them.
Chat with the user in their language (Russian).

## Git is the user's call

On your own initiative, only `git add`. `commit`, `push`, branching, rebasing, opening a
PR — every other git action waits for the user to ask. Drafting the message is your job;
deciding that it runs is theirs. Typing [`/prep-pr`](../commands/prep-pr.md) **is** that
decision — the command then commits, pushes and opens the PR in one go — and so is asking in
words. So is [`/close-ticket`](../commands/close-ticket.md), which ends on a fresh `main` so
that the next ticket does not start on the last one's branch: from a clean tree only, never
building a merge commit (`--ff-only`), and never deleting the merged branch without asking.
What is forbidden is reaching for git because it seemed like the next step.

The one exception, because it prevents work from landing in the wrong place: when a new
feature starts while the branch is `main`, create the feature branch first. That rule and the
return above are two halves of one thing — a flow that never comes back to `main` never
reaches the branching rule at all.

## Naming and messages describe behaviour

Branch names, commit messages and PR text say **what changes for the app and why** — not
which files were touched. A reader who never opens the diff should still understand what
the work does.

- **Branch:** `F<phase>.<feature>-<what-it-does>` — the Notion ticket plus a short
  kebab-case description.
  ✅ `F1.1-add-clerk-to-frontend`, `F0.10-fix-railway-cache-mounts`
  ❌ `feature/updates`, `F1.1`, `fix-layout-and-proxy`
- **Commit:** Conventional Commits with the ticket as the scope —
  `<type>(F<x.x>): <what changed, in behaviour terms>`. Types: `feat`, `fix`, `chore`,
  `docs`, `refactor`, `test`, `build`, `ci`, `perf`.
  ✅ `feat(F1.1): protect all routes and add a sign-in page`
  ❌ `feat(F1.1): edit layout.tsx, proxy.ts and turbo.json`
- **PR title:** the problem the PR solves, readable on its own in the PR list.
  ✅ `F1.1: close the app to anonymous visitors and add Clerk sign-in`
  ❌ `F1.1: Clerk changes`, `Update middleware and env files`
- **PR description:** length tracks how much of the reasoning is invisible in the diff, not
  how many files changed. **What & why** — one to three sentences, the problem and what the
  app does differently now — is the only part that is always there. Add **Changes** when
  there is more than a handful and the order matters (user-visible behaviour first, then
  config, CI and dependencies, with a reason for each non-obvious one); **Testing** when it
  says something CI does not already report (a manual check, a test that proves this
  specific fix, something you could not verify); **Notes / follow-ups** when the reviewer
  must do something by hand — secrets, env variables, dashboard settings — or a gap was
  left deliberately.
  A section you would fill with "n/a" or with a restatement of the title is deleted, not
  filled: an empty heading trains the reader to skip headings. A one-line fix gets a
  two-sentence body; a change that trades something off gets as much room as the trade-off
  needs.

## Reporting

- Be direct and concrete: bullets over paragraphs, `file:line` over "the auth code".
- Present options with a recommendation and its reason, not a survey. Decisions that are
  genuinely the user's (see [model integrity](model-integrity.md)) get asked; routine ones
  get made.
- Grade findings as **MUST FIX** (breaks behaviour, violates a rule, fails CI) /
  **SHOULD FIX** (convention or maintainability) / **NICE TO HAVE** (deferrable). The first
  two block [`/prep-pr`](../commands/prep-pr.md) until they are fixed or explicitly
  overruled, and the third ships — so the grade answers "should the PR wait for this?", not
  "how much does it bother me?".
- Close by saying what was run, what it proved, and what is still open.
