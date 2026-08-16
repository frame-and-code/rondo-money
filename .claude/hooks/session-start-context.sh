#!/usr/bin/env bash
# SessionStart — put the state of the working tree in front of the agent before it starts.
#
# Advisory only: stdout becomes session context, exit is always 0.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
COMMITS=$(git log --oneline -5 2>/dev/null || echo "no commits")

echo "## Session context"
echo
echo "- Branch: \`$BRANCH\`"
echo "- Uncommitted files: $DIRTY"
echo
echo "### Last 5 commits"
echo '```'
echo "$COMMITS"
echo '```'

if [ "$BRANCH" = "main" ]; then
  echo
  echo "⚠️ On \`main\`. Starting a feature? Create the branch first: \`F<phase>.<feature>-<what-it-does>\`."
fi

exit 0
