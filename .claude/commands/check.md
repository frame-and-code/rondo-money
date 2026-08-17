---
description: Run the full quality gate — lint, typecheck, format, tests — and report failures honestly.
argument-hint: '[workspace filter, e.g. @rondo/api]'
---

# Check

The same gate CI runs, run locally before it does. Everything goes through Turborepo, so
it is parallelised across workspaces and cached where caching is safe.

## Steps

Run all six, and run them all even if an earlier one fails — a single report beats six
round trips:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm test
pnpm scan:secrets
```

`build` and `scan:secrets` are in the list because the gate CI enforces is
`secrets · static · build · unit · integration · e2e`: without them this command can pass
while CI fails. `build` is not covered by `typecheck` — [`docs/ci.md`](../../docs/ci.md)
records the case where a TypeScript bump left `apps/api` unbuildable while `tsc --noEmit`
stayed green. `scan:secrets` needs gitleaks on `PATH`; if it is missing, say so rather than
reporting a gate that did not run.

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

## Local e2e trap

After a local e2e run `apps/web/next-env.d.ts` shows up modified, because `next dev`
rewrites it to its dev variant. It must never be swept into a commit; the fix is to discard
it with `git checkout -- apps/web/next-env.d.ts`. That command throws local changes away,
so propose it and let the user run it — like every git action beyond `git add`. Details in
[`docs/testing.md`](../../docs/testing.md).
