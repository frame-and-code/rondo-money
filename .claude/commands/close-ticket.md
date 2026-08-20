---
description: After the PR is merged, close the Notion ticket — tick the AC/DoD items that have evidence, correct what the work made false, record the PRs and the decisions, put ✅ in the title.
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
   gh pr view <N> --json headRefOid,mergeCommit   # the two SHAs
   git fetch origin refs/pull/<N>/head            # reachable even if the branch was deleted
   git diff <headRefOid> <mergeCommit.oid>        # empty = the merge carried exactly that work
   ```

   A squash merge leaves no branch commits in `main`, so the commit log proves nothing and an
   empty diff does. Comparing against `origin/main` instead looks equivalent and is not: it
   needs a local branch that may be gone, and once anything else lands on `main` it reports
   those unrelated changes as if this ticket's work were missing. The merge commit is the PR's
   own snapshot, so the comparison stays true however long afterwards it is run. What it
   catches is work pushed after the merge button — which is not hypothetical.

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
7. **Report** what changed and what stayed open. Nothing here touches git.

## Report

```markdown
## <ticket> — closed / left open

- PRs: #<N> (merged <date>, <sha>), … — and whether the merged content matches the branch
- [x] <criterion> — <evidence>
- [ ] <criterion> — left open: <what is missing>
- Corrected: <a criterion's note the merged work made false> (omit when none)
- Recorded: <the decisions written into the ticket, and the comment linking the PRs>
- Title: ✅ set / already set / withheld — <open items>
```

$ARGUMENTS
