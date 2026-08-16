#!/usr/bin/env bash
# PreToolUse :: Bash — refuse commands that break a project rule.
#
# Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
# Input: the PreToolUse JSON on stdin; the command is .tool_input.command.
#
# Node does the JSON parsing: it is already a hard requirement of this repo (see the
# README), so the guard adds no new prerequisite. If it is missing we block rather than
# wave everything through — a guard that fails open is not a guard.

set -uo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED: node is required by the Bash guard hook but was not found on PATH." >&2
  exit 2
fi

COMMAND=$(node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try {
      process.stdout.write(JSON.parse(raw)?.tool_input?.command ?? "");
    } catch {
      process.stdout.write("");
    }
  });
')

[ -z "$COMMAND" ] && exit 0

# This project is pnpm-only: a stray npm/yarn install rewrites the lockfile.
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|(]\s*)(npm|yarn)\s'; then
  echo "BLOCKED: this project uses pnpm. Use pnpm instead of npm/yarn." >&2
  exit 2
fi

# The pre-commit hook is the secret scan (ADR-003: publishing exposes the whole history).
# Skipping it is never the fix for a gitleaks hit.
if printf '%s' "$COMMAND" | grep -qE '(--no-verify|(^|\s)-n(\s|$))' &&
  printf '%s' "$COMMAND" | grep -qE 'git\s+(commit|push)'; then
  echo "BLOCKED: --no-verify skips the gitleaks pre-commit scan. Remove the secret instead." >&2
  exit 2
fi

if printf '%s' "$COMMAND" | grep -qE '(^|\s)HUSKY=0(\s|$)'; then
  echo "BLOCKED: HUSKY=0 disables the git hooks, including the secret scan." >&2
  exit 2
fi

# main is protected by a branch ruleset; fail here rather than at the remote.
if printf '%s' "$COMMAND" | grep -qE 'git\s+push' &&
  printf '%s' "$COMMAND" | grep -qE '(^|\s)main(\s|$)|:main(\s|$)'; then
  echo "BLOCKED: main takes changes through a PR only. Push the feature branch instead." >&2
  exit 2
fi

# Recursive delete aimed at a root, a home, a parent or a bare glob.
if printf '%s' "$COMMAND" | grep -qiE 'rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\s+(/\s|/\s*$|\.\.|~|/Users|\.\s*$|\*)'; then
  echo "BLOCKED: dangerous recursive delete. Name the exact path to remove." >&2
  exit 2
fi

exit 0
