---
description: 'Run the full quality gate: lint, typecheck, format, contract and tests, then report failures honestly.'
argument-hint: '[workspace filter, e.g. @rondo/api]'
---

# Check

The same gate CI runs, run locally before it does. Everything goes through Turborepo, so
it is parallelised across workspaces and cached where caching is safe.

## Steps

Run all ten, and run them all even if an earlier one fails. A single report beats ten
round trips:

```bash
pnpm lint --force
pnpm lint:hooks
pnpm lint:docs
pnpm typecheck --force
pnpm format:check
pnpm build --force
pnpm test
pnpm test:hooks
pnpm scan:secrets
./codegen.sh check
```

⚠️ **`--force` on the cached tasks.** Turbo caches `lint`, `typecheck`, `build`, `test:unit`,
`openapi` and `codegen`; on a hit it reprints the previous run's output in full, `✓` and
timings included, then exits 0. That is indistinguishable from a real pass, so a report
calling it one describes a check that did not run this time
([model integrity](../rules/model-integrity.md)). The cached tasks take seconds here, so
forcing them costs nothing and removes the question.

`--force` buys one thing: a green line in your report describes _this_ state of the tree, not
an earlier one that hashed the same. It does **not** buy agreement with CI, because the hash
covers files and not environment.

`test`, `test:integration` and `test:e2e` are already `cache: false` in `turbo.json` and need
no flag.

### When local and CI disagree on the same commit

The cache is not the suspect. Turbo re-executes on a changed file. The difference is
environment, and the sharpest one here is that **`lint` is the only task that depends on
nothing**. Everything else builds first, while the CI `static` job lints a tree nothing has
built. Reproduce that before forming a theory:

```bash
mv packages/types/dist /tmp/dist-aside && pnpm lint --force; mv /tmp/dist-aside packages/types/dist
```

`build`, `scan:secrets` and `codegen.sh` are in the list because CI's gate has members this
command would otherwise miss. The job list lives in [`docs/ci.md`](../../docs/ci.md) and is
not restated here. Without them this command can pass while CI fails. `sonar` is the one
member with no local counterpart. The analysis needs a token and the server's verdict, so
this command cannot anticipate it. On a pull request it blocks (F1.12), so a green run here
is not a promise that `gate` will be green.

`build` is not covered by `typecheck`. [`docs/ci.md`](../../docs/ci.md)
records the case where a TypeScript bump left `apps/api` unbuildable while `tsc --noEmit`
stayed green. `scan:secrets` needs gitleaks on `PATH`; if it is missing, say so rather than
reporting a gate that did not run. `./codegen.sh check` is the `static` job's contract drift
step (F1.5). It regenerates `apps/api/openapi.json` and the client and fails if either moved,
which on a clean tree means the committed pair is stale. It runs last because everything
above has already warmed turbo's cache for it.

`pnpm lint:hooks`, `pnpm test:hooks` and `pnpm lint:docs` are the odd ones out. They cover
`.claude/` and the prose, not the app. What `lint:docs` refuses, and how far its reach goes,
is written in [specs](../rules/specs.md).

`pnpm lint` and `pnpm test` are `turbo run …`, so they only reach workspaces, and
`.claude` is not one. A lint error or a broken guard there is invisible to both. That is
where the guard hooks live, the ones that keep a secret-scan bypass or a migration against dev
from going through, so the gap is not a cosmetic one.

`pnpm test` covers unit, integration and e2e, and those two levels have prerequisites:
Postgres, Clerk keys, and a **stopped `/dev` stack, api included**. They are listed in
[`docs/testing.md`](../../docs/testing.md); if one was missing, say which level was not
exercised instead of calling the run green.

With `$ARGUMENTS`, target one workspace: `pnpm --filter <name> lint` and so on.

## Report

- Group findings by kind: type errors, lint errors, formatting, failing tests.
- Quote the actual failure and its `file:line`, not a summary of it.
- Fix what is mechanical (formatting, auto-fixable lint) and say what you fixed. For
  anything that changes behaviour, propose the fix and let the user decide.
- If everything passed, say what ran, including which levels were skipped and why.
