#!/usr/bin/env bash
# PreToolUse :: Bash — keep destructive database commands on the local database.
#
# Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
# Dev and prod migrations run through the deployment pipeline, never from a shell here.
#
# Nothing here echoes the command or the connection string. A destructive command can carry
# its target inline — `DATABASE_URL=postgres://user:password@host/db pnpm db:migrate` — so
# repeating it back would write a password into the transcript, which is exactly what
# .claude/rules/security.md forbids. The message names the host and nothing else: that is
# what makes the decision understandable.

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

is_local_host() {
  case "$1" in
    localhost | 127.0.0.1 | 0.0.0.0 | ::1 | "[::1]" | host.docker.internal | postgres | db) return 0 ;;
    *) return 1 ;;
  esac
}

# A command can name its own target and override everything this hook's environment holds:
# `DATABASE_URL=postgres://remote/… pnpm db:migrate`, or `prisma db execute --url …`. The
# hook sees that assignment only as text in the command, never in its own env — so checking
# the ambient value alone would clear a migration against a database the command does not
# even use. Whatever the command names is therefore checked first, and all of it.
TARGETS=$(printf '%s' "$COMMAND" |
  grep -oE '(DATABASE_URL=|--url[= ])[^[:space:];&|)]+' |
  sed -E 's/^(DATABASE_URL=|--url[= ])//' |
  tr -d '"\047')

# Nothing named inline: fall back to the environment, then to the repo .env (git-ignored,
# holds the local credentials — see .env.example).
[ -z "$TARGETS" ] && TARGETS="${DATABASE_URL:-}"
if [ -z "$TARGETS" ] && [ -f "$PROJECT_DIR/.env" ]; then
  TARGETS=$(grep -E '^[[:space:]]*DATABASE_URL=' "$PROJECT_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '"\047' | tr -d '[:space:]')
fi

if [ -z "$TARGETS" ]; then
  echo "BLOCKED: this command can destroy data and no DATABASE_URL is set, so its target cannot be verified. Set it (see .env.example) or run the command yourself." >&2
  exit 2
fi

# One remote target among them is enough to block.
while IFS= read -r TARGET; do
  [ -z "$TARGET" ] && continue
  # Host only — strip the scheme, then any user:password, then port/path/query.
  HOST=$(printf '%s' "$TARGET" | sed -E 's#^[a-zA-Z0-9+.-]+://##; s#^[^@/]*@##; s#[:/?].*$##')
  if [ -z "$HOST" ] || ! is_local_host "$HOST"; then
    echo "BLOCKED: this destructive database command targets '${HOST:-an unparseable host}', not the local database. Dev and prod migrations go through the deployment pipeline." >&2
    exit 2
  fi
done <<EOF
$TARGETS
EOF

exit 0
