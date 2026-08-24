---
description: Tidy what the change touched, prove it is ready (gate, docs sweep, a review round), then commit with a convention-shaped message, push, and open the PR.
argument-hint: '<F1.x ticket>'
---

# Prep PR

Runs as one explicitly requested step the three git actions that each normally wait for the
user: commit, push and `gh pr create`. Typing this command **is** the user's
ask ([communication.md](../rules/communication.md)); nothing here weakens the rule that
the agent never commits or pushes on its own initiative.

Expect it to pause. None of `git commit`, `git push`, `git switch -c` or `gh pr create` is
in the allow list in [`settings.json`](../settings.json), so each reaches the user as a
permission prompt. That is where the authorisation actually happens and it is the design, not
friction to route around. A user who wants the sequence unattended widens their own
git-ignored `settings.local.json`.

## Steps

1. **Branch check.** On `main`? Create the feature branch first, named
   `F<x.x>-<what-it-does>`, so nothing lands on main directly (`guard-bash.sh` blocks pushing
   it anyway); that one is the exception [communication.md](../rules/communication.md) already
   grants, because it prevents work landing in the wrong place. On a feature branch whose name
   no longer matches what it carries, **propose the rename and let the user run it**.
   Renaming is not among the three actions typing this command authorises, and a branch name
   is the user's to choose.
2. **Leave it tidier than you found it, but only where you were already working.** Go through
   the files this change touches, and nothing else: a comment that no longer describes the
   code under it, code the change orphaned, a Russian comment in a file you edited
   ([communication.md](../rules/communication.md) says translate it when you touch it), a
   TODO with no owner and no ticket, an `any` or a silencing cast the change made avoidable.
   The bound is the point. A cleanup in a file the ticket never opened makes the diff harder
   to review and belongs in its own change, and **nothing here may alter behaviour**. A
   refactor is a decision, not tidying, and it gets its own PR. Runs before the gate so the
   gate validates what you actually ship.
3. **Prove the code is ready.** Run the gate with [`/check`](check.md), unless it already
   ran green in this session on the exact current state of the tree; "it passed before my
   last edit" does not count. A red gate stops the command here, before any git action,
   with the failures reported. A level that could not run is named in the report, not
   silently skipped. Its prerequisites are in [`docs/testing.md`](../../docs/testing.md).
4. **Correct the prose this change made false** with [`/sync-docs`](sync-docs.md). This is the
   last moment it is still the same PR, which is what [specs.md](../rules/specs.md) requires;
   a follow-up "docs" task is how drift starts. Cheap when there is nothing to fix, and the
   report says which documents were checked and found accurate. A sweep that reports nothing
   cannot be told apart from a sweep nobody ran.
5. **Review rounds** with [`/review`](review.md), unless the change is of a kind that rule
   says does not earn one (a copy edit, a dependency bump, a one-line fix that cannot fail
   silently). That command fans out to `pr-reviewer` subagents, and **reaching this step is
   the explicit request to spawn them**, exactly as typing `/prep-pr` is the request for the
   three git actions. A standing "no subagents unless asked" is satisfied here; doing the
   round single-context instead is a weaker pass reported under the same name. Print what each
   round found, then:
   - a **MUST FIX** or **SHOULD FIX** that came back `confirmed` **is fixed here, in this run,
     without asking**. One that came back `unproven` is reported at its grade and left alone:
     nothing settled it either way, and rewriting code on a claim nobody could confirm is how
     a review round starts costing more than it returns. Print it first, so the user sees what was found and at what grade,
     then fix it and run the next round on the new state. **The fix is where the next bug
     lives** (`review.md` records the chain that proved it), so the round after a fix is the
     one worth having, and it is the reason this loop exists rather than a single pass;
   - **the loop runs at most three rounds.** Stop at the first round that finds nothing
     blocking. A blocking finding in the third round is fixed like any other, and then the run
     **stops before the commit**, reaching no git action at all: that fix goes unreviewed, and
     needing a fourth round is the signal the change is too large to review, which no further
     round solves. Report which round stopped it and what went in unread;
   - **NICE TO HAVE is not part of the loop.** Fix only the quick wins, the ones whose change
     is small, local and obviously right. Everything else is carried into the PR and named in
     the report, so the choice is visible rather than implied. A NICE TO HAVE is never a
     reason to run another round;
   - a finding the **user** overrules is recorded in the report, not silently dropped.
     Deciding a finding is wrong or over-graded stays theirs; deciding to fix a blocking one
     does not, because the grade already carries that decision.

   Fixing inside the run is what keeps a blocking finding from becoming a follow-up nobody
   files. **Any** file this step changes re-runs **step 3 and step 4**, whether or not another
   round follows: a round of quick wins schedules no next round, and without this the commit
   would carry edits no level ever ran over. A fix that breaks a level must not reach the
   commit, and a fix that makes a sentence false is what the sweep is for. Both are cheap next
   to another fan-out.

   Convention findings block on purpose. This repository is written by an agent, so "we'll
   tidy it next time" has no one to fall to. What is genuinely deferrable is a NICE TO HAVE,
   and grading it honestly is what keeps the gate from turning into a formality.

   **After the gate and the sweep, and that ordering is load-bearing.** After the gate, because
   there is no sense spending four agents on a tree that does not compile; after the tidy-up
   and the sweep, because the first round must read a tree whose prose is already corrected.
   The other order was tried and is worse in both directions. The prose reviewer would find the
   sentences the sweep had not corrected yet and block on them, so the run never reached the
   step written to fix exactly that. This step does change the tree, which is why a round that
   fixed something is followed by another one rather than by the commit.

6. **Stage what is about to ship.** `git status` and the diff: stage what belongs to the
   ticket, and name anything deliberately left behind. No `git add -A` reflex. Unrelated
   files stay out.
7. **Commit** with a message per [communication.md](../rules/communication.md):
   `<type>(F<x.x>): <what changes for the app, in behaviour terms>`. If the pre-commit
   hook refuses, whether over a secret or a contract change whose sources are not all
   staged, fix the cause it names; never route around the hook.
8. **Push** the branch: `git push -u origin <branch>`.
9. **Open the PR** with `gh pr create`, base `main`, title and description in the shape
   communication.md defines: What & why always; Changes / Testing / Notes only when they
   add something the diff does not say.
10. **Report** in the shape below, short and readable: what changed for the app, what was
    committed, and the gate as a table. Merging stays with the user (`gh pr merge` is
    deny-listed); [`/babysit-pr`](babysit-pr.md) takes it from here, and after the merge
    [`/close-ticket`](close-ticket.md) records it in Notion.

## Report

```markdown
## <ticket>: PR opened, or stopped at <the gate | round <n>>

- Branch: <name>
- Commit: <sha>, <message> (omit when the run stopped before committing)
- PR: <url> (omit when the run stopped before committing)
- Left out: <unstaged files, and why> (omit when none)

### Changed

- <file or area>: <what it now does differently, one line each>

### Tidied

- <what the boy-scout pass cleaned up, one line each> (omit the section when nothing was)

### Review

- Round <n>: <what it found, and what was fixed in response>
- Stopped at: <the round that found nothing blocking, or the third with what still stands>
- Overruled: <a blocking finding the user judged wrong or over-graded, and their reason> (omit when none)
- Carried into the PR: <NICE TO HAVE left unfixed> (omit when none)

### Docs

- <document>: <what was corrected>, or "checked, still accurate"

### Gate

| Check                     | Result                 |
| ------------------------- | ---------------------- |
| lint / typecheck / format | ✅ / ❌ <failure>      |
| build                     | ✅ / ❌ <failure>      |
| unit / integration / e2e  | ✅ / ⏭️ skipped: <why> |
| guard hooks               | ✅ / ❌ <failure>      |
| secret scan               | ✅ / ❌                |
| contract drift            | ✅ / ❌                |
```

A skipped level appears as skipped with its reason, never as a silent pass.

$ARGUMENTS
