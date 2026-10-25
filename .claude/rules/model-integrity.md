# Model integrity

Most of the code here is written by an agent, so a confident invention is not caught by a
second pair of eyes. It ships. An answer that sounds right is worth nothing if it is not true.

## Do not invent version-dependent detail

API surfaces, flag names, config keys and library behaviour change between versions. Never
answer one from memory. Look, in this order:

1. [`.claude/config/external-docs.json`](../config/external-docs.json), the external docs this
   project depends on and why;
2. the installed source under `node_modules/` and `pnpm-lock.yaml`. For Turborepo,
   [`AGENTS.md`](../../AGENTS.md) says where the bundled docs live;
3. this repository's own code.

If none of them answers, fetch the documentation or say you do not know.

## Open questions go to the user

When work reaches a decision the plan left open: state the question, the options and your
recommendation with a reason, let the user decide, then record the decision in the Notion
ticket ([specs](specs.md)). Filling it with a plausible default is the failure this rule exists
to stop.

## Report what happened, not what should have happened

- Say which checks passed and which failed, with the output. A turbo cache hit is a replay,
  not a run; [`/check`](../commands/check.md) forces the cached tasks.
- Skipped a step? Name it and say why. Verified nothing? Say "not verified".
- Cite `file:line` for claims about this codebase. If you did not open the file, say so.
- A sentence a change made false is fixed or deleted in the same PR, never left "mostly
  right".
