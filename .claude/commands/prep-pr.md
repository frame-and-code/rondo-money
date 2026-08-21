---
description: Tidy what the change touched, prove it is ready (gate, docs sweep, a review round), then commit with a convention-shaped message, push, and open the PR.
argument-hint: '<F1.x ticket>'
---

# Prep PR

Runs the three git actions that each normally wait for the user — commit, push,
`gh pr create` — as one explicitly requested step. Typing this command **is** the user's
ask ([communication.md](../rules/communication.md)); nothing here weakens the rule that
the agent never commits or pushes on its own initiative.

Expect it to pause: none of `git commit`, `git push`, `git switch -c` or `gh pr create` is
in the allow list in [`settings.json`](../settings.json), so each reaches the user as a
permission prompt. That is where the authorisation actually happens and it is the design, not
friction to route around — a user who wants the sequence unattended widens their own
git-ignored `settings.local.json`.

## Steps

1. **Branch check.** On `main`? Create the feature branch first — `F<x.x>-<what-it-does>`
   — so nothing lands on main directly (`guard-bash.sh` blocks pushing it anyway); that one
   is the exception [communication.md](../rules/communication.md) already grants, because it
   prevents work landing in the wrong place. On a feature branch whose name no longer matches
   what it carries, **propose the rename and let the user run it** — renaming is not among
   the three actions typing this command authorises, and a branch name is the user's to
   choose.
2. **Leave it tidier than you found it — only where you were already working.** Go through
   the files this change touches, and nothing else: a comment that no longer describes the
   code under it, code the change orphaned, a Russian comment in a file you edited
   ([communication.md](../rules/communication.md) says translate it when you touch it), a
   TODO with no owner and no ticket, an `any` or a silencing cast the change made avoidable.
   The bound is the point — a cleanup in a file the ticket never opened makes the diff harder
   to review and belongs in its own change, and **nothing here may alter behaviour**: a
   refactor is a decision, not tidying, and it gets its own PR. Runs before the gate so the
   gate validates what you actually ship.
3. **Prove the code is ready.** Run the gate — [`/check`](check.md) — unless it already
   ran green in this session on the exact current state of the tree; "it passed before my
   last edit" does not count. A red gate stops the command here, before any git action,
   with the failures reported. A level that could not run — its prerequisites are in
   [`docs/testing.md`](../../docs/testing.md) — is named in the report, not silently skipped.
4. **Correct the prose this change made false** — [`/sync-docs`](sync-docs.md). This is the
   last moment it is still the same PR, which is what [specs.md](../rules/specs.md) requires;
   a follow-up "docs" task is how drift starts. Cheap when there is nothing to fix, and the
   report says which documents were checked and found accurate — a sweep that reports nothing
   cannot be told apart from a sweep nobody ran.
5. **One review round** — [`/review`](review.md) — unless the change is of a kind that rule
   says does not earn one (a copy edit, a dependency bump, a one-line fix that cannot fail
   silently). That command fans out to `pr-reviewer` subagents, and **reaching this step is
   the explicit request to spawn them** — exactly as typing `/prep-pr` is the request for the
   three git actions. A standing "no subagents unless asked" is satisfied here; doing the
   round single-context instead is a weaker pass reported under the same name. Print what it found, then:
   - a **MUST FIX** or **SHOULD FIX** that survived verification **stops this command here**,
     before any git action. Report it and hand back: fixing is the user's call, and so is
     deciding that the finding is wrong or that its severity was inflated — an overruled
     finding is recorded in the report, not silently dropped. Once it is resolved, running
     `/prep-pr` again reviews the new state — which is where the second round comes from, and
     why the loop needs no machinery of its own. The fix is where the next bug lives
     (`review.md` records the chain that proved it), so the round after a fix is the one worth
     having;
   - **NICE TO HAVE** is reported and does not block. Say plainly that it is being carried
     into the PR, so the choice is visible rather than implied.

   Convention findings block on purpose: this repository is written by an agent, so "we'll
   tidy it next time" has no one to fall to. What is genuinely deferrable is a NICE TO HAVE,
   and grading it honestly is what keeps the gate from turning into a formality.

   **Last of everything that changes the tree, and that ordering is load-bearing.** After the
   gate, because there is no sense spending four agents on a tree that does not compile; after
   the tidy-up and the sweep, because a reviewer must read what is about to be committed. The
   other order was tried and is worse in both directions: the prose reviewer would find the
   sentences the sweep had not corrected yet and block on them, so the run never reached the
   step written to fix exactly that — while the prose the sweep then wrote went into the
   commit unread by anyone.

6. **Stage what is about to ship.** `git status` and the diff: stage what belongs to the
   ticket, and name anything deliberately left behind. No `git add -A` reflex — unrelated
   files stay out.
7. **Commit** with a message per [communication.md](../rules/communication.md):
   `<type>(F<x.x>): <what changes for the app, in behaviour terms>`. If the pre-commit
   hook refuses — a secret, or a contract change whose sources are not all staged — fix
   the cause it names; never route around the hook.
8. **Push** the branch: `git push -u origin <branch>`.
9. **Open the PR** with `gh pr create`, base `main`, title and description in the shape
   communication.md defines: What & why always; Changes / Testing / Notes only when they
   add something the diff does not say.
10. **Report** in the shape below — short and readable: what changed for the app, what was
    committed, and the gate as a table. Merging stays with the user (`gh pr merge` is
    deny-listed); [`/babysit-pr`](babysit-pr.md) takes it from here, and after the merge
    [`/close-ticket`](close-ticket.md) records it in Notion.

## Report

```markdown
## <ticket> — PR opened

- Branch: <name>
- Commit: <sha> — <message>
- PR: <url>
- Left out: <unstaged files, and why> (omit when none)

### Changed

- <file or area> — <what it now does differently, one line each>

### Tidied

- <what the boy-scout pass cleaned up, one line each> (omit the section when nothing was)

### Review

- Round <n>: <blocking findings: none — or them, and the fact that the command stopped>
- Overruled: <a blocking finding the user judged wrong or over-graded, and their reason> (omit when none)
- Carried into the PR: <NICE TO HAVE left unfixed> (omit when none)

### Docs

- <document> — <what was corrected>, or "checked, still accurate"

### Gate

| Check                     | Result                  |
| ------------------------- | ----------------------- |
| lint / typecheck / format | ✅ / ❌ <failure>       |
| build                     | ✅ / ❌ <failure>       |
| unit / integration / e2e  | ✅ / ⏭️ skipped — <why> |
| guard hooks               | ✅ / ❌ <failure>       |
| secret scan               | ✅ / ❌                 |
| contract drift            | ✅ / ❌                 |
```

A skipped level appears as skipped with its reason — never as a silent pass.

$ARGUMENTS
