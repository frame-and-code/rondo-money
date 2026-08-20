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
pnpm lint
pnpm lint:hooks
pnpm typecheck
pnpm format:check
pnpm build
pnpm test
pnpm test:hooks
pnpm scan:secrets
./codegen.sh check
```

`build`, `scan:secrets` and `codegen.sh` are in the list because the gate CI enforces is
`secrets · static · build · unit · integration · e2e`: without them this command can pass
while CI fails. `build` is not covered by `typecheck` — [`docs/ci.md`](../../docs/ci.md)
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

With `$ARGUMENTS`, target one workspace: `pnpm --filter <name> lint` and so on.

## Report

- Group findings by kind: type errors, lint errors, formatting, failing tests.
- Quote the actual failure and its `file:line`, not a summary of it.
- Fix what is mechanical (formatting, auto-fixable lint) and say what you fixed. For
  anything that changes behaviour, propose the fix and let the user decide.
- If everything passed, say what ran — including which levels were skipped and why.
