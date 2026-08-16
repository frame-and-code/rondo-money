#!/usr/bin/env bash
# PreToolUse :: Bash — keep destructive database commands on the local database.
#
# Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
# Dev and prod migrations run through the deployment pipeline, never from a shell here.
#
# The connection string is only ever inspected, never printed: the message names the host,
# which is what makes the decision understandable, and nothing else.

set -uo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED: node is required by the database guard hook but was not found on PATH." >&2
  exit 2
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

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

# Commands that can drop or overwrite data, plus the pnpm aliases that wrap them
# (db:migrate -> prisma migrate dev, db:deploy -> prisma migrate deploy).
DESTRUCTIVE='prisma[[:space:]]+migrate[[:space:]]+(reset|deploy|dev)|prisma[[:space:]]+db[[:space:]]+(push|execute)|(^|[[:space:]])db:(migrate|deploy)([[:space:]]|$)|dropdb|DROP[[:space:]]+(DATABASE|SCHEMA|TABLE)|TRUNCATE[[:space:]]'

printf '%s' "$COMMAND" | grep -qiE "$DESTRUCTIVE" || exit 0

# DATABASE_URL from the environment, else from the repo .env (git-ignored, holds the
# local credentials — see .env.example).
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] && [ -f "$PROJECT_DIR/.env" ]; then
  DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$PROJECT_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]')
fi

if [ -z "$DB_URL" ]; then
  echo "BLOCKED: '$COMMAND' can destroy data and DATABASE_URL is not set, so its target cannot be verified. Set it (see .env.example) or run the command yourself." >&2
  exit 2
fi

# Host only — strip scheme and any user:password, then the port/path/query.
HOST=$(printf '%s' "$DB_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://##; s#^[^@/]*@##; s#[:/?].*$##')

case "$HOST" in
  localhost | 127.0.0.1 | 0.0.0.0 | ::1 | "[::1]" | host.docker.internal | postgres | db)
    exit 0
    ;;
esac

echo "BLOCKED: '$COMMAND' is destructive and DATABASE_URL points at '$HOST', not the local database. Dev and prod migrations go through the deployment pipeline." >&2
exit 2
