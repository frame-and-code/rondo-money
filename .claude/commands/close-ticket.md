---
description: After the PR is merged, mark the Notion ticket done — tick the AC/DoD items that have evidence, flag the ones that do not, put ✅ in the title.
argument-hint: '<F1.x ticket or Notion link>'
---

# Close ticket

The post-merge counterpart of [`/phase-done`](phase-done.md): that command proves the work
is ready **before** the PR; this one records in Notion that it **landed**. Run it after the
user has merged — never to make an unmerged ticket look finished.

## Steps

1. **Confirm the work actually landed.** Find the PR that carried the ticket
   (`gh pr list --state merged --search "<ticket>"`, or the number the user gives) and
   check `mergedAt` via `gh pr view`. Not merged → stop and say so: this command records
   history, it does not predict it.
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
4. **Tick the title** once every item is either ticked or explicitly declared out of scope
   by the user: prefix the page title with `✅ ` (the phase page lists child titles, so
   nothing else needs editing). Idempotent — a title already carrying ✅ is left alone.
5. **Report** what changed and what stayed open. Nothing here touches git.

## Report

```markdown
## <ticket> — closed / left open

- PR: #<N>, merged <date>
- [x] <criterion> — <evidence>
- [ ] <criterion> — left open: <what is missing>
- Title: ✅ set / already set / withheld — <open items>
```

$ARGUMENTS
