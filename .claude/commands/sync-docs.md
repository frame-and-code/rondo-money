---
description: Sweep the documentation the current change touches and correct every sentence it made false.
argument-hint: '[area, e.g. ci | testing | deploy | a workspace path]'
---

# Sync docs

The project rule is that prose gets corrected in the **same** PR as the change (see
[`.claude/rules/specs.md`](../rules/specs.md)). This command performs that sweep.

## Steps

1. **Establish what changed**, and read the changes, not just the file names.
   `git diff main...HEAD` for what is committed, `git diff` and `git diff --cached` for work
   still in the tree, and `git status --porcelain` to catch untracked files, which no diff
   shows. A sweep driven by paths alone misses the sentence a change quietly falsified.
   With `$ARGUMENTS`, narrow the sweep to that area instead.
2. **Map changes to documents.** For each area touched:
   - anything about running, requirements or project state → `README.md`
   - CI jobs, the job graph, required checks → `docs/ci.md`
   - Railway services, variables, domains, ports → `docs/deploy-railway.md`
   - test levels, commands, prerequisites → `docs/testing.md`
   - code inside a workspace → that workspace's `README.md`, especially its structure tree
     and any "skeleton, arrives in F0.x" line
   - a moved decision, a changed phase scope, a new rule, command or hook → `CLAUDE.md`
     and `.claude/`
   - repository settings, licence, contribution stance → `SECURITY.md`,
     `CONTRIBUTING.md`, `NOTICE`
3. **Read each candidate and check it sentence by sentence** against what the code now
   does. Look hardest at version numbers, ports, command names, file paths and phase
   labels. They rot first and they read as authoritative.
4. **Correct in place.** Delete rather than leave half-true. Where something is planned but
   not built, say that in the text. Never write the intent in the present tense.
5. **Check the canonical documents too.** If the work changed or superseded a decision, the
   Notion ADR or ticket is updated in the same change, and the old statement is marked
   superseded rather than left looking current. That part is prepared for the user to
   confirm, not silently published.

## Report

List each file with what was corrected and why it had gone stale. If a document was
checked and is still accurate, say so. A sweep that reports nothing is indistinguishable
from a sweep that was never run.

$ARGUMENTS
