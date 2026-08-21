---
description: 'After the PR is merged, close the Notion ticket: tick the AC/DoD items that have evidence, correct what the work made false, record the PRs and the decisions, put ✅ in the title, return to a fresh main and delete the merged local branches.'
argument-hint: '<F1.x ticket or Notion link>'
---

# Close ticket

The post-merge counterpart of [`/phase-done`](phase-done.md). That command proves the work
is ready **before** the PR; this one records in Notion that it **landed**. Run it after the
user has merged, never to make an unmerged ticket look finished.

## Steps

1. **Confirm the work actually landed.** Find **every** PR that carried the ticket
   (`gh pr list --state merged --search "<ticket>"`, plus any number the user gives). A
   ticket is often closed by more than one, and naming only the last one loses the rest. Check
   `mergedAt` via `gh pr view`. Not merged → stop and say so: this command records history, it
   does not predict it.

   Then check what actually landed, not just that something did. **Compare the PR's head
   against its merge commit**, not against `main`:

   ```bash
   gh pr view <N> --json headRefOid,headRefName,mergeCommit   # the SHAs, and the branch name
   git fetch origin refs/pull/<N>/head            # reachable even if the branch was deleted
   git diff <headRefOid> <mergeCommit.oid>        # empty = the merge carried exactly that work
   ```

   A squash merge leaves no branch commits in `main`, so the commit log proves nothing and an
   empty diff does. Comparing against `origin/main` instead looks equivalent and is not. It
   needs a local branch that may be gone, and once anything else lands on `main` it reports
   those unrelated changes as if this ticket's work were missing. The merge commit is the PR's
   own snapshot, so the comparison stays true however long afterwards it is run.

   That the diff is empty rather than "main's changes since the branch forked" **depends on
   the ruleset requiring the branch to be up to date before merging**. It does today
   (`strict_required_status_checks_policy`), which is why GitHub refuses a behind branch and
   updating it produces a new head. If that requirement is ever relaxed, expect the target's
   own changes here and compare only the paths the PR touched.

   And check the other end too: `git rev-parse --verify refs/heads/<headRefName>` against
   `headRefOid`. Equal diffs prove the merge carried what the PR held; they say nothing about
   a commit pushed _after_ the merge button, which never entered the PR at all and is
   invisible to any comparison that starts from it.

   Two things about that spelling, both load-bearing because a force delete hangs off it.
   Name the branch rather than `HEAD`. Whenever the session is on `main`, which step 7
   contemplates and where it leaves you, `HEAD` is main's tip and never matches, and the
   mismatch reads as "the branch carries something the PR did not" about a commit that does
   not exist. And name the ref in full: a bare `<headRefName>` goes through ordinary revision
   lookup, which tries `refs/tags/` **before** `refs/heads/`, so a tag of the same name answers
   instead. Git prints `refname is ambiguous` on stderr and puts the tag's sha on
   stdout, where anything reading the command sees only the wrong sha. `--verify refs/heads/…`
   asks the one question meant here, and its failure then means exactly one thing: no such
   local branch. That is not a failed proof either. There is simply nothing to delete, and
   step 7 reports that rather than treating it as a problem.

2. **Fetch the ticket** from Notion (MCP server; the link the user provides, or search by
   the ticket code). Collect every checkbox: Acceptance Criteria, DoD, and any inline
   checklists in the scope sections.
3. **Tick with evidence, not optimism.** For each unchecked item, name the evidence in the
   merged work: a test, a file, a CI run, a manual check the user reported. Then:
   - evidence exists → tick it (`- [ ]` → `- [x]`) and append a short note in the style
     the ticket already uses: `— **done <date>**, PR #<N>` plus one clause saying what the
     evidence is;
   - no evidence → leave it unticked and put it in the report with what is missing. A
     half-done ticket keeps an honest checklist; the ✅ in the title then waits.
4. **Correct what the merged work made false.** A criterion's own note goes stale like any
   other sentence. "Seven commands" stops being true when the PR shipped three more, and a
   ticket read later is trusted the way a rule is. Check each note against what is now in
   `main` and fix what no longer holds ([specs.md](../rules/specs.md)). Every AC being ticked
   already is not a reason to skip this step; it is the case where it matters most, because
   nothing else will make you read them.
5. **Record the history, which is the part nobody can reconstruct later.** Two writes:
   - **A comment on the page** naming every PR that carried the ticket: full URL, merge date,
     merge commit, and one clause on what each contributed. The comment is what makes the
     ticket and the PRs findable from each other; a reader a year from now has the ticket and
     nothing else.
   - **The decisions** the work took, into the body, when the ticket does not already hold
     them. Not a changelog. The diff is the changelog. What belongs here is what the diff
     cannot show: the option that was rejected and why, the boundary that was drawn, the rule
     that changed. That is what [specs.md](../rules/specs.md) means by the ticket being the
     decision memory, and it is the difference between a ticket that stops the next agent from
     re-deciding and one that only says the work is done.
6. **Tick the title** once every item is either ticked or explicitly declared out of scope
   by the user: prefix the page title with `✅ ` (the phase page lists child titles, so
   nothing else needs editing). It is idempotent, and a title already carrying ✅ is left
   alone.
7. **Leave the ground ready for the next ticket.** The work has landed, so this branch is
   history, and a session that stays on it starts the next feature there. That is not
   hypothetical: the rule in `CLAUDE.md` about branching only fires when the branch _is_
   `main`, so a flow that never returns there never fires it, and F1.11 duly began on F1.9's
   branch. Closing the ticket is the moment the ground can be cleared, so clear it:

   **Ask before you move, not after.** `git switch main` followed by a `git pull` that cannot
   fast-forward leaves the session standing on a diverged `main`, the one state this step
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
     branch, say so, and let the user look. A diverged `main` is a thing to understand, not
     to resolve on the way past. (No local `main` at all is not divergence: `git switch main`
     creates it from `origin/main`, and there is nothing to pull.)
   - **`--ff-only` even so.** The check and the pull race in principle, and this is the belt
     that makes the braces unnecessary: a merge commit on `main` cannot be built by accident.

   **Once the session stands on `main`, delete the local branches the ticket came in on.**
   Closing the ticket is what turns them into history, so removing them belongs to the close
   and is not a separate question ([communication.md](../rules/communication.md)). The branch
   on the server is not this command's to remove. See below.

   Skip the deletion entirely, and say so, whenever the move did not leave you on a clean
   `main`: conditions 1 or 2 kept the session on the feature branch, or the tree is dirty
   however you arrived. Git refuses to delete a branch that is checked out, so attempting it
   there fails, and a `git branch -D` that fails or that the user refuses ends the deletion
   for that branch rather than being retried another way.

   One branch per PR, each judged against **its own** PR. Step 1 collects every PR that
   carried the ticket, so a ticket closed by three of them has three branches to clear.

   ```bash
   git fetch origin --prune                          # prune is what makes "gone" mean gone
   git ls-remote --heads origin <headRefName>        # non-empty → still on the server: propose, delete nothing
   git rev-parse --verify refs/heads/<headRefName>   # == headRefOid → the work landed; fails → nothing local to delete
   git branch -vv --list <headRefName>               # upstream marked "gone" → the server has let go of it
   git branch -D -- <headRefName>                    # -D, not -d: a squash merge leaves it looking unmerged
   ```

   **The remote branch is deleted by GitHub, not by this command.** The repository has
   `delete_branch_on_merge` switched on, so pressing Merge removes it; by the time a ticket is
   closed it is normally gone already. What is left for the command is to notice, not to act:
   a branch still standing on the server after a merge is unusual enough to be worth a human
   look, so name it in the report and **offer** the deletion rather than running it. That is
   deliberately narrower than the local half, and the asymmetry is the point. `git branch -D`
   loses nothing that the merge commit and the reflog do not still hold, while
   `git push origin --delete` can destroy a commit that reached `origin` after the merge and
   exists in no `refs/pull/<N>/head`. There is no version of that command this loop should run
   on its own authority, so it does not appear here at all.

   The two local checks answer different questions and both are cheap. `rev-parse` says the
   branch is the work the PR carried; the `gone` upstream marker says the server has already
   let go of it, which after the prune above is the local record of what `ls-remote` just
   confirmed. A branch that fails either check is left standing and named. No local branch at
   all is not a failed proof; there is simply nothing to delete.

   Expect the deletion to pause. `git branch -D` is not in the allow list in
   [`settings.json`](../settings.json), so it reaches the user as a permission prompt, the
   same arrangement [`/prep-pr`](prep-pr.md) has for commit and push. That is where the
   authorisation actually happens and it is the design, not friction to route around. It is
   also not the command asking: not asking means not handing the decision back to the user in
   words and not leaving the branch standing pending an answer.

   Already on `main`: just pull. This is the one step that changes which branch you are on,
   since step 1's fetch and diff read git without moving anything. And it is deliberate:
   typing `/close-ticket` is the decision, the same way typing [`/prep-pr`](prep-pr.md) is
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
  `main` has diverged> — and which local branches were deleted, or why any were left standing;
  name any branch still on the server and offer to remove it
```

$ARGUMENTS
