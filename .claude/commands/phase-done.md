---
description: 'Close out a ticket: verify its Acceptance Criteria one by one, run the gate, sweep the docs, draft the PR text.'
argument-hint: '<F1.x ticket>'
---

# Phase done

Everything that stands between "the code works on my machine" and "this ticket is
finished". This is the verification pass, run before the PR exists. What follows it:
[`/prep-pr`](prep-pr.md) tidies, gates and opens the PR, [`/babysit-pr`](babysit-pr.md)
shepherds it to merge-ready, and once the user has merged,
[`/close-ticket`](close-ticket.md) records the result in Notion.

## Steps

1. **Re-read the ticket's Acceptance Criteria** (Notion, via its MCP server or the link the
   user provides). Go through them **one by one** and, for each, state the evidence:
   which test, which file, which manual check. A criterion with no evidence is not met.
   Say so plainly rather than ticking it.
2. **Run the gate** with [`/check`](check.md). Integration and e2e have prerequisites
   ([`docs/testing.md`](../../docs/testing.md)); if a level did not run, that goes in the
   report, not in the silence.
3. **Check the DoD that belongs to every phase**, not only this ticket:
   - migrations for this phase's tables, applied and reversible in a fresh database;
   - tests at the levels the change touches, written with the feature;
   - cross-tenant tests for any new domain table or raw aggregate (ADR-005);
   - invariant 5.5 still green where the change touches budget maths;
   - any repeatable pattern this phase introduced captured as a rule or skill in
     `.claude/`, the DoD item that keeps this setup from rotting.
4. **Sweep the documentation** with [`/sync-docs`](sync-docs.md).
5. **Draft the git text** in the format from
   [`.claude/rules/communication.md`](../rules/communication.md): the commit message and
   the full PR description (What & why / Changes / Testing / Notes & follow-ups). Draft
   only. Nothing here commits or pushes; [`/prep-pr`](prep-pr.md) does that when the user
   asks for it.

## Report

```markdown
## <ticket> — readiness

### Acceptance Criteria

- [x] <criterion> — <evidence: test, file:line, or the manual check performed>
- [ ] <criterion> — **not met**: <what is missing>

### Gate

- lint / typecheck / format / tests: <result, including any level not exercised and why>

### Docs

- <file> — <what was corrected>, or "checked, still accurate"

### Left for the user

- <secrets, dashboard settings, anything that cannot be done from here>

### Commit and PR text

<drafts>
```

$ARGUMENTS
