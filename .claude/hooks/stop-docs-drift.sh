#!/usr/bin/env bash
# Stop — if this session changed code but no prose, say so before it ends.
#
# The project rule is that documentation is corrected in the same PR as the change
# (.claude/rules/specs.md); this is the mechanical reminder behind it. Advisory only:
# stdout goes back to the agent, exit is always 0. Silent when there is nothing to say.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Paths, without the two-character status prefix; rename entries keep their destination.
CHANGED=$(git status --porcelain 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //')
[ -z "$CHANGED" ] && exit 0

CODE=$(printf '%s\n' "$CHANGED" | grep -E '^(apps/|packages/|\.github/|\.husky/|.*\.(ts|tsx|mjs|cjs|js|jsx|prisma|sql|sh|ya?ml|json|properties)$)' | grep -vE '\.md$' || true)
[ -z "$CODE" ] && exit 0

DOCS=$(printf '%s\n' "$CHANGED" | grep -E '\.md$' || true)
[ -n "$DOCS" ] && exit 0

cat <<'EOF'
## Documentation sweep not done

This session changed code but no `.md` file. The project rule is that prose is corrected in
the same PR as the change, not in a follow-up (`.claude/rules/specs.md`).

Check whether any of these went stale: `README.md`, `docs/ci.md`, `docs/deploy-railway.md`,
`docs/testing.md`, the workspace `README.md` next to the code you touched, `CLAUDE.md` and
`.claude/`. If nothing needed correcting, say so — running `/sync-docs` does the sweep.
EOF

exit 0
