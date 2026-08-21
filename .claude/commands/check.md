---
description: Run the full quality gate — lint, typecheck, format, contract, tests — and report failures honestly.
argument-hint: '[workspace filter, e.g. @rondo/api]'
---

# Check

The same gate CI runs, run locally before it does. Everything goes through Turborepo, so
it is parallelised across workspaces and cached where caching is safe.

## Steps

Run all nine, and run them all even if an earlier one fails — a single report beats nine
round trips:

```bash
pnpm lint --force
pnpm lint:hooks
pnpm typecheck --force
pnpm format:check
pnpm build --force
pnpm test
pnpm test:hooks
pnpm scan:secrets
./codegen.sh check
```

⚠️ **`--force` on the cached tasks.** Turbo caches `lint`, `typecheck`, `build`, `test:unit`,
`openapi` and `codegen`; on a hit it prints the previous run's output — `✓`, timings and all —
and exits 0. The output is indistinguishable from a real pass, so a report that calls it one is
describing a check that did not run this time
([model integrity](../rules/model-integrity.md)). The cached tasks take seconds here, so
forcing them costs nothing and removes the question.

Be precise about what this does and does not buy, because guessing at it has already produced a
wrong diagnosis. Turbo's invalidation is sound: change a file and the task re-executes —
measured, by introducing a lint error and watching `cache miss` catch it. What `--force` buys
is that a green line in your report describes _this_ state of the tree, rather than an earlier
one that happened to hash the same.

What it does **not** buy is agreement with CI, because the hash covers files rather than
environment. A task whose result depends on state turbo does not hash — most sharply, whether a
workspace has been **built** — passes locally and fails in CI at the identical commit, cache or
no cache. That is what happened on PR #59: `import-x` classifies `@rondo/types` differently
depending on whether its `dist` exists, `lint` has no `^build` dependency, so a locally-built
tree linted clean and CI did not. The fix was to pin the classification
(`packages/config/eslint/base.mjs`), not to re-run anything. When local and CI disagree on the
same commit, look for that kind of difference before blaming the cache.

`test`, `test:integration` and `test:e2e` are already `cache: false` in `turbo.json` and need
no flag.

### When local and CI disagree on the same commit

Reproduce CI's conditions before forming a theory. The difference is environment, and the
sharpest one in this repository is written in `turbo.json`: **`lint` is the only task with
`dependsOn: []`**. Everything else builds first (`^build`) or chains (`^typecheck`), and the
`static` job runs `pnpm install` then `pnpm lint` with nothing built — while a developer's tree
has `dist` in it after any `test`, `build` or `dev`. So `lint` is the one gate step that reads a
different tree on each side.

To reproduce it, take the built output away and lint again:

```bash
mv packages/types/dist /tmp/dist-aside && pnpm lint --force; mv /tmp/dist-aside packages/types/dist
```

That is how the PR #59 failure was pinned, after a first guess blamed the turbo cache and was
wrong — the cache invalidates correctly, which was itself confirmed by introducing a lint error
and watching `cache miss` catch it. Guessing costs more than the two minutes reproducing it.

`build`, `scan:secrets` and `codegen.sh` are in the list because the gate CI enforces is
`secrets · static · build · unit · integration · e2e · sonar`: without them this command can
pass while CI fails. `sonar` is the one member with no local counterpart — the analysis needs
a token and the server's verdict, so this command cannot anticipate it. On a pull request it
blocks (F1.12), so a green run here is not a promise that `gate` will be green.

`build` is not covered by `typecheck` — [`docs/ci.md`](../../docs/ci.md)
records the case where a TypeScript bump left `apps/api` unbuildable while `tsc --noEmit`
stayed green. `scan:secrets` needs gitleaks on `PATH`; if it is missing, say so rather than
reporting a gate that did not run. `./codegen.sh check` is the `static` job's contract drift
step (F1.5): it regenerates `apps/api/openapi.json` and the client and fails if either moved,
which on a clean tree means the committed pair is stale. It runs last because everything
above has already warmed turbo's cache for it.

`pnpm lint:hooks` and `pnpm test:hooks` are the odd ones out: they cover `.claude/`, not the
app. `pnpm lint` and `pnpm test` are `turbo run …`, so they only reach workspaces, and
`.claude` is not one — a lint error or a broken guard there is invisible to both. That is
where the guard hooks live, the ones that keep a secret-scan bypass or a migration against dev
from going through, so the gap is not a cosmetic one.

`pnpm test` covers unit, integration and e2e. Integration and e2e need Postgres
(`docker compose up -d`) and e2e needs Clerk keys in `apps/web/.env.local`; if either is
missing, say which level was not exercised instead of calling the run green.

E2E also need **:3001 free of a dev server** (F1.11). They run against a production build,
and Playwright reuses whatever already holds that port — so the `pnpm dev` server
[`/dev`](dev.md) starts there does not get replaced, it aborts the level with "reports mode
development". Stop it before `/check`, or run the two apart.

With `$ARGUMENTS`, target one workspace: `pnpm --filter <name> lint` and so on.

## Report

- Group findings by kind: type errors, lint errors, formatting, failing tests.
- Quote the actual failure and its `file:line`, not a summary of it.
- Fix what is mechanical (formatting, auto-fixable lint) and say what you fixed. For
  anything that changes behaviour, propose the fix and let the user decide.
- If everything passed, say what ran — including which levels were skipped and why.
