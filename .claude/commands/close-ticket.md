---
description: After the PR is merged, close the Notion ticket — tick the AC/DoD items that have evidence, correct what the work made false, record the PRs and the decisions, put ✅ in the title, return to a fresh main and delete the merged branches (local and remote).
argument-hint: '<F1.x ticket or Notion link>'
---

# Close ticket

The post-merge counterpart of [`/phase-done`](phase-done.md): that command proves the work
is ready **before** the PR; this one records in Notion that it **landed**. Run it after the
user has merged — never to make an unmerged ticket look finished.

## Steps

1. **Confirm the work actually landed.** Find **every** PR that carried the ticket
   (`gh pr list --state merged --search "<ticket>"`, plus any number the user gives) — a
   ticket is often closed by more than one, and naming only the last one loses the rest. Check
   `mergedAt` via `gh pr view`. Not merged → stop and say so: this command records history, it
   does not predict it.

   Then check what actually landed, not just that something did — **compare the PR's head
   against its merge commit**, not against `main`:

   ```bash
   gh pr view <N> --json headRefOid,headRefName,mergeCommit   # the SHAs, and the branch name
   git fetch origin refs/pull/<N>/head            # reachable even if the branch was deleted
   git diff <headRefOid> <mergeCommit.oid>        # empty = the merge carried exactly that work
   ```

   A squash merge leaves no branch commits in `main`, so the commit log proves nothing and an
   empty diff does. Comparing against `origin/main` instead looks equivalent and is not: it
   needs a local branch that may be gone, and once anything else lands on `main` it reports
   those unrelated changes as if this ticket's work were missing. The merge commit is the PR's
   own snapshot, so the comparison stays true however long afterwards it is run.

   That the diff is empty rather than "main's changes since the branch forked" **depends on
   the ruleset requiring the branch to be up to date before merging** — it does today
   (`strict_required_status_checks_policy`), which is why GitHub refuses a behind branch and
   updating it produces a new head. If that requirement is ever relaxed, expect the target's
   own changes here and compare only the paths the PR touched.

   And check the other end too: `git rev-parse --verify refs/heads/<headRefName>` against
   `headRefOid`. Equal diffs prove the merge carried what the PR held; they say nothing about
   a commit pushed _after_ the merge button, which never entered the PR at all and is
   invisible to any comparison that starts from it.

   Two things about that spelling, both load-bearing because a force delete hangs off it.
   Name the branch rather than `HEAD`: whenever the session is on `main` — which step 7
   contemplates, and where it leaves you — `HEAD` is main's tip and never matches, and the
   mismatch reads as "the branch carries something the PR did not" about a commit that does
   not exist. And name the ref in full: a bare `<headRefName>` goes through ordinary revision
   lookup, which tries `refs/tags/` **before** `refs/heads/`, so a tag of the same name answers
   instead — measured: git prints `refname is ambiguous` on stderr and puts the tag's sha on
   stdout, where anything reading the command sees only the wrong sha. `--verify refs/heads/…` asks the one question meant here, and its failure
   then means exactly one thing — no such local branch, which is not a failed proof either:
   there is simply nothing local to delete, and step 7's remote half still applies.

2. **Fetch the ticket** from Notion (MCP server; the link the user provides, or search by
   the ticket code). Collect every checkbox — Acceptance Criteria, DoD, and any inline
   checklists in the scope sections.
3. **Tick with evidence, not optimism.** For each unchecked item, name the evidence in the
   merged work: a test, a file, a CI run, a manual check the user reported. Then:
   - evidence exists → tick it (`- [ ]` → `- [x]`) and append a short note in the style
     the ticket already uses: `— **done <date>**, PR #<N>` plus one clause saying what the
     evidence is;
   - no evidence → leave it unticked and put it in the report with what is missing. A
     half-done ticket keeps an honest checklist; the ✅ in the title then waits.
4. **Correct what the merged work made false.** A criterion's own note goes stale like any
   other sentence — "seven commands" stops being true when the PR shipped three more — and a
   ticket read later is trusted the way a rule is. Check each note against what is now in
   `main` and fix what no longer holds ([specs.md](../rules/specs.md)). Every AC being ticked
   already is not a reason to skip this step; it is the case where it matters most, because
   nothing else will make you read them.
5. **Record the history, which is the part nobody can reconstruct later.** Two writes:
   - **A comment on the page** naming every PR that carried the ticket — full URL, merge date,
     merge commit, and one clause on what each contributed. The comment is what makes the
     ticket and the PRs findable from each other; a reader a year from now has the ticket and
     nothing else.
   - **The decisions** the work took, into the body, when the ticket does not already hold
     them. Not a changelog — the diff is the changelog. What belongs here is what the diff
     cannot show: the option that was rejected and why, the boundary that was drawn, the rule
     that changed. That is what [specs.md](../rules/specs.md) means by the ticket being the
     decision memory, and it is the difference between a ticket that stops the next agent from
     re-deciding and one that only says the work is done.
6. **Tick the title** once every item is either ticked or explicitly declared out of scope
   by the user: prefix the page title with `✅ ` (the phase page lists child titles, so
   nothing else needs editing). Idempotent — a title already carrying ✅ is left alone.
7. **Leave the ground ready for the next ticket.** The work has landed, so this branch is
   history — and a session that stays on it starts the next feature there. That is not
   hypothetical: the rule in `CLAUDE.md` about branching only fires when the branch _is_
   `main`, so a flow that never returns there never fires it, and F1.11 duly began on F1.9's
   branch. Closing the ticket is the moment the ground can be cleared, so clear it:

   **Ask before you move, not after.** `git switch main` followed by a `git pull` that cannot
   fast-forward leaves the session standing on a diverged `main` — the one state this step
   exists to avoid, reached by the step itself. So establish that the move is a fast-forward
   first, and only then make it:

   ```bash
   git fetch origin
   git merge-base --is-ancestor main origin/main   # no local main yet? skip — switch creates it
   git switch main && git pull --ff-only
   ```

   Three conditions on the move, none of them optional:

   - **Only with a clean working tree.** `git status --porcelain` non-empty → change nothing,
     name what is uncommitted and let the user decide. Switching would either drag those
     changes onto `main` or fail halfway through.
   - **Only when `main` can fast-forward.** The `--is-ancestor` check above answers that
     without moving anything; false means `main` has commits of its own. Stay on the current
     branch, say so, and let the user look — a diverged `main` is a thing to understand, not
     to resolve on the way past. (No local `main` at all is not divergence: `git switch main`
     creates it from `origin/main`, and there is nothing to pull.)
   - **`--ff-only` even so.** The check and the pull race in principle, and this is the belt
     that makes the braces unnecessary: a merge commit on `main` cannot be built by accident.

   **Once the session stands on `main`, delete the branches the ticket came in on — local and
   remote.** Closing the ticket is what turns them into history, so removing them belongs to
   the close and is not a separate question
   ([communication.md](../rules/communication.md)).

   The order is one way round. Git refuses to delete a branch that is checked out, so a delete
   attempted before the move fails at the local half — and by the rule below, a failed
   `git branch -D` ends the deletion for that branch. Nothing would be destroyed, but nothing
   would be cleared either, and the report would be a list of failures. So skip the deletion
   entirely, and say so, whenever the move did not leave you on a clean `main`: conditions 1
   or 2 kept the session on the feature branch, or the tree is dirty however you arrived.

   One branch per PR, each judged against **its own** PR — step 1 collects every PR that
   carried the ticket, so a ticket closed by three of them has three branches to clear. And
   each half is judged on its own evidence, because each half destroys a different ref:

   ```bash
   git fetch origin --prune                          # so the report is not written from stale refs
   git rev-parse --verify refs/heads/<headRefName>   # == headRefOid → delete locally; fails → nothing local to delete
   git branch -D -- <headRefName>                    # -D, not -d: a squash merge leaves it looking unmerged
   git ls-remote --heads origin <headRefName>        # 0 + headRefOid → delete on the server; 0 + empty → already gone
   git push origin --delete <headRefName>            # non-zero from ls-remote → the check did not run; delete nothing
   ```

   **The local head does not vouch for the remote one.** A commit can reach `origin/<branch>`
   after the merge — from another clone, another machine, the GitHub UI — and this clone will
   not have it, so `git rev-parse` still matches while the ref the push destroys does not.
   That commit is in no `refs/pull/<N>/head` either, by definition: it never entered the PR.
   So the remote delete is gated on the sha `ls-remote` prints, not on the local branch and
   not on mere existence. A sha that differs from `headRefOid` means someone pushed after the
   merge — leave the branch, name the commit, and say so. `ls-remote` still leaves the window
   between the read and the push, which nothing here closes; it narrows it from "since the
   merge" to "while the prompt is open".

   Each half also stands alone when the other cannot run. No local branch — a fresh clone, a
   second machine, a re-run, a user who tidied up already — is not a failed proof: there is
   nothing local to delete, and the remote half is judged on its own sha. And a `git branch
-D` that fails or that the user refuses **ends the deletion for that branch**: do not run
   the remote half. A refusal there means "keep this branch", and answering it by deleting the
   copy that cannot be recovered from a reflog is the opposite of what was asked.

   The remote branch is usually gone already, removed by whoever pressed Merge or by
   `delete_branch_on_merge`, and `git push origin --delete` on a branch that no longer exists
   fails rather than doing nothing — so the existence check earns its line either way. None of
   the decisions above read a remote-tracking ref; the prune is there so that anything the
   report says about branches is not read off a stale one, which is a mistake this repository
   has already made once.

   Expect both deletions to pause: neither `git branch -D` nor `git push origin --delete` is
   in the allow list in [`settings.json`](../settings.json), so each reaches the user as a
   permission prompt — the same arrangement [`/prep-pr`](prep-pr.md) has for commit and push.
   That is where the authorisation actually happens and it is the design, not friction to
   route around. It is also not the command asking: not asking means not handing the decision
   back to the user in words and not leaving the branch standing pending an answer.

   Already on `main`: just pull. This is the one step that changes which branch you are on —
   step 1's fetch and diff read git without moving anything — and it is deliberate: typing
   `/close-ticket` is the decision, the same way typing [`/prep-pr`](prep-pr.md) is
   ([communication.md](../rules/communication.md)).

8. **Report** what changed and what stayed open.

## Report

```markdown
## <ticket> — closed / left open

- PRs: #<N> (merged <date>, <sha>), … — and whether the merged content matches the branch
- [x] <criterion> — <evidence>
- [ ] <criterion> — left open: <what is missing>
- Corrected: <a criterion's note the merged work made false> (omit when none)
- Recorded: <the decisions written into the ticket, and the comment linking the PRs>
- Title: ✅ set / already set / withheld — <open items>
- Branch: on `main`, up to date / left on `<branch>` because <what is uncommitted, or that
  `main` has diverged> — and which branches were deleted (local, and remote where it still
  existed), or why any were left standing
```

$ARGUMENTS
