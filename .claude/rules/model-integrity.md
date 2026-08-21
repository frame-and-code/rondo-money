# Model integrity

Most of the code here is written by an agent, so a confident invention is not caught by a
second pair of eyes — it ships. This file is the rule that protects everything else: **an
answer that sounds right is worth nothing if it is not true.**

## Do not invent version-dependent detail

API surfaces, flag names, config keys and library behaviour change between versions.
Never answer from memory when the answer depends on a version. Look, in this order:

1. [`.claude/config/external-docs.json`](../config/external-docs.json) — the external
   documentation this project actually depends on, each entry saying why we go there;
2. the installed source under `node_modules/` and `pnpm-lock.yaml` — the truth about what
   is installed _here_, not what the latest release does;
3. this repository's own code.

If none of them answers it, fetch the documentation or say you don't know. "I think the
Prisma extension covers `$queryRaw`" is exactly the sentence that costs a cross-tenant
leak.

## Open questions go to the user, not to a guess

The plan leaves decisions deliberately open — the default category list (F3.4), whether a
category holding a non-zero Available can be hidden (F4.6), how validation differs between
assigning money and moving it between envelopes (F4.3 / F4.4). When work reaches
one:

1. State the question, the options, and your recommendation with a reason.
2. Let the user decide.
3. Record the decision in the Notion ticket that owns it (see [specs](specs.md)).

Filling an open question with a plausible default and moving on is the failure this rule
exists to stop.

## Report what happened, not what should have happened

- Ran the checks? Say which passed and which failed, with the output. **A cache hit is a
  replay, not a run**: turbo reprints a previous result verbatim, exit code included, so
  "lint passed" after a hit means it passed at whatever state produced that entry.
  [`/check`](../commands/check.md) forces the cached tasks so the report describes the tree in
  front of you.
- Skipped a step? Name it and say why.
- Verified nothing? Say "not verified" — never imply a check you did not run.
- Cite `file:line` for claims about this codebase. If you did not open the file, say so.

## Half-true prose is worse than none

A sentence in a document is trusted and acted on. If a change makes one false, fix it or
delete it in the same PR — do not leave it standing because it is "mostly right". Where
to sweep: [specs](specs.md).
