#!/usr/bin/env bash
# Stop — if the Prisma schema changed but the scoped-model registry did not, say so before
# the session ends.
#
# A new table carrying `userId` is invisible to the auto-scoping extension until it is listed
# in apps/api/src/prisma/scoped-models.ts, and between those two commits it is readable by
# anyone (ADR-005). The *guarantee* against that is the unit test
# (apps/api/test/scoped-models.spec.ts), which fails in the CI gate for everyone; this hook is
# only the earlier reminder, and it fires inside a Claude Code session alone. Advisory:
# stdout goes back to the agent, exit is always 0. Silent when there is nothing to say.
#
# It deliberately does not parse the schema. Re-implementing the test's logic here would drift
# from it silently — and a check that quietly stops matching is worse than no check, which is
# exactly why ADR-005 rejected its option C.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Paths, without the two-character status prefix; rename entries keep their destination.
CHANGED=$(git status --porcelain 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //')
[ -z "$CHANGED" ] && exit 0

printf '%s\n' "$CHANGED" | grep -qx 'packages/db/prisma/schema.prisma' || exit 0
printf '%s\n' "$CHANGED" | grep -qx 'apps/api/src/prisma/scoped-models.ts' && exit 0

cat <<'EOF'
## The Prisma schema changed, the scoped-model registry did not

`packages/db/prisma/schema.prisma` is modified while
`apps/api/src/prisma/scoped-models.ts` is untouched. If this change added a table that
carries `userId`, four things belong in the same PR (ADR-005):

1. the model in `SCOPED_MODELS` — otherwise every query against it is unfiltered;
2. its migration, generated locally (`pnpm --filter @rondo/db exec prisma migrate dev`),
   then `pnpm --filter @rondo/db build` so the client types include the model;
3. a cross-tenant test ("user B sees nothing of user A's") — required by the DoD of every
   phase that adds domain tables;
4. `@map` / `@@map` on the new names: PascalCase models and camelCase fields in Prisma,
   snake_case tables and columns in Postgres.

If the edit added no user-owned table (a comment, an enum, a column on an already-registered
model), there is nothing to do — say so and move on.
EOF

exit 0
