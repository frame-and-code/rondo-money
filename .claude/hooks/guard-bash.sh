#!/usr/bin/env bash
# PreToolUse :: Bash — refuse commands that break a project rule.
#
# Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
# Input: the PreToolUse JSON on stdin; the command is .tool_input.command.
#
# This file is the entry point and the fail-closed wrapper; the decision lives in
# guard-bash.mjs, which tokenises the command the way a shell does and applies the rules to
# words rather than to text. Its header says why that distinction is the whole design.
#
# Node does the work because it is already a hard requirement of this repository (see the
# README), so the guard adds no new prerequisite. If node is missing we block rather than wave
# everything through — a guard that fails open is not a guard, and the same goes for the
# decision script having been deleted or made unreadable.

set -uo pipefail

HOOK_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DECIDER="$HOOK_DIR/guard-bash.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED: node is required by the Bash guard hook but was not found on PATH." >&2
  exit 2
fi

if [ ! -r "$DECIDER" ]; then
  echo "BLOCKED: the Bash guard's decision script is missing at $DECIDER." >&2
  exit 2
fi

node "$DECIDER"
STATUS=$?

# Any exit other than allow-or-block means the decider itself failed — a syntax error, a
# runtime throw. Treat it as a refusal and say so, rather than letting a broken guard read as
# a green light.
if [ "$STATUS" -ne 0 ] && [ "$STATUS" -ne 2 ]; then
  echo "BLOCKED: the Bash guard failed to run (exit $STATUS); refusing rather than guessing." >&2
  exit 2
fi

exit "$STATUS"
