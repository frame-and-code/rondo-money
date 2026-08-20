#!/usr/bin/env bash
# Stop — name the documents this session's changes are likely to have made false.
#
# The project rule is that documentation is corrected in the same PR as the change
# (.claude/rules/specs.md); this is the mechanical reminder behind it. Advisory only:
# stdout goes back to the agent, exit is always 0. Silent when there is nothing to say.
#
# It used to ask one question — "code changed and no .md did?" — and that went quiet the
# moment any .md was touched at all. The session that edited a README while leaving
# docs/ci.md describing a job graph that no longer exists is exactly the drift this hook is
# for, and it was the one case it could not see. So the question is now per area: this code
# moved, and the document that describes it did not.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Paths, without the two-character status prefix; rename entries keep their destination.
# -uall lists untracked files one by one. Without it git collapses a wholly new directory to
# a single `?? apps/`, and the mapping below — which works on paths — falls back to the
# generic nudge for exactly the case it should be loudest about: a workspace that did not
# exist before. This hook fires at Stop, where unstaged is the normal shape.
CHANGED=$(git status --porcelain -uall 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //')

[ -z "$CHANGED" ] && exit 0

CODE=$(printf '%s\n' "$CHANGED" | grep -E '^(apps/|packages/|\.github/|\.husky/|\.claude/|.*\.(ts|tsx|mjs|cjs|js|jsx|prisma|sql|sh|ya?ml|json|properties)$)' | grep -vE '\.md$' || true)
[ -z "$CODE" ] && exit 0

changed_matches() { printf '%s\n' "$CHANGED" | grep -qE "$1"; }

STALE=""
# code area → the document that describes it. Listed only when the code side moved and the
# document did not, so a sweep that already happened stays silent.
note_pair() {
  changed_matches "$1" || return 0
  changed_matches "$2" && return 0
  STALE="$STALE$3"$'\n'
}

note_pair '^\.github/workflows/' '^docs/ci\.md$' \
  '- `docs/ci.md` — the job graph and the required checks; a workflow changed.'
note_pair '(railway\.json|^docker-compose|^Dockerfile|^apps/[^/]+/Dockerfile)' '^docs/deploy-railway\.md$' \
  '- `docs/deploy-railway.md` — services, variables, domains and ports; the deployment configuration changed.'
note_pair '(test|spec|playwright\.config|jest\.config)' '^docs/testing\.md$' \
  '- `docs/testing.md` — levels, commands and prerequisites; something about tests changed.'
note_pair '^(packages/db/prisma/|packages/db/migrations/)' '^packages/db/README\.md$' \
  '- `packages/db/README.md` — the schema or a migration changed.'
note_pair '^\.claude/' '^(\.claude/README\.md|CLAUDE\.md)$' \
  '- `.claude/README.md` and `CLAUDE.md` — the agent setup changed: a rule, command, agent, skill or hook.'

# Every workspace carries its own README, and its structure tree and "arrives in F0.x" lines
# rot fastest. Derive them from what actually changed rather than listing them here, so a new
# workspace is covered the day it appears.
for WORKSPACE in $(printf '%s\n' "$CHANGED" | grep -oE '^(apps|packages)/[^/]+' | sort -u); do
  # Something other than prose has to have moved, or a README edit would flag itself.
  printf '%s\n' "$CHANGED" | grep -E "^$WORKSPACE/" | grep -qvE '\.md$' || continue
  changed_matches "^$WORKSPACE/README\.md$" && continue
  STALE="$STALE- \`$WORKSPACE/README.md\` — code in that workspace changed; check its structure tree."$'\n'
done

if [ -z "$STALE" ]; then
  # Nothing specific to name. A session that touched no prose at all still gets the general
  # nudge, because the mapping above is a shortlist, not the whole rule.
  printf '%s\n' "$CHANGED" | grep -qE '\.md$' && exit 0
  cat <<'EOF'
## Documentation sweep not done

This session changed code but no `.md` file. The project rule is that prose is corrected in
the same PR as the change, not in a follow-up (`.claude/rules/specs.md`).

Check whether any of these went stale: `README.md`, `docs/ci.md`, `docs/deploy-railway.md`,
`docs/testing.md`, the workspace `README.md` next to the code you touched, `CLAUDE.md` and
`.claude/`. If nothing needed correcting, say so — running `/sync-docs` does the sweep.
EOF
  exit 0
fi

echo "## Documentation likely stale"
echo
echo "This session changed code whose documentation it did not touch:"
echo
printf '%s' "$STALE"
echo
echo "Check each one and correct it in this change, not a follow-up (\`.claude/rules/specs.md\`)."
echo "\`/sync-docs\` does the sweep. If a document is still accurate, say so rather than staying silent."

exit 0
