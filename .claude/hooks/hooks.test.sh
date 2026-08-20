#!/usr/bin/env bash
# Tests for the guard hooks. Run: pnpm test:hooks (also part of /check and the CI gate).
#
# Why they exist: guard-bash.sh and guard-db.sh are the only mechanical stop between an
# agent's shortcut and a burned secret or a wiped remote database, and both decide by
# pattern-matching a command string. A pattern that quietly stops matching still exits 0 —
# the failure is silence, which is the same reason ADR-005 refused to leave raw SQL to a
# convention. AI review on PR #40 closed four bypasses in these scripts, so
# the cases below are adversarial by design: every wrapper, spelling and refspec form the
# patterns were written against is pinned here, and so is every command that must stay
# allowed — a guard that blocks ordinary work gets switched off, which is worse than none.
#
# No test framework: bash and node only, both already required by the repository.

set -uo pipefail

HOOKS_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PASSED=0
FAILED=0

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

# Two repositories so the branch a bare `git push` would publish is a fact of the test, not
# of whoever runs it. No commit needed: symbolic-ref reads an unborn branch fine.
REPO_MAIN="$SANDBOX/on-main"
REPO_FEATURE="$SANDBOX/on-feature"
REPO_MASTER="$SANDBOX/on-master"
git init -q -b main "$REPO_MAIN"
git init -q -b F9.9-some-feature "$REPO_FEATURE"
git init -q -b master "$REPO_MASTER"

# The project directory a hook sees. Defaults to a bare sandbox: no .env, so the database
# guard cannot fall back to a local connection string that only exists on a real checkout.
PROJECT_DIR="$SANDBOX"
DB_URL=""

# Feeds one PreToolUse payload to a hook and captures its exit code and stderr. node builds
# the JSON so a command containing quotes, backslashes or newlines is tested as written.
run_hook() {
  local hook="$1" command="$2"
  local payload env_args=()

  payload=$(node -e 'process.stdout.write(JSON.stringify({ tool_name: "Bash", tool_input: { command: process.argv[1] } }))' "$command")

  if [ -n "$DB_URL" ]; then
    env_args=(DATABASE_URL="$DB_URL")
  else
    env_args=(-u DATABASE_URL)
  fi

  STDERR=$(printf '%s' "$payload" | env "${env_args[@]}" CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOKS_DIR/$hook" 2>&1 >/dev/null)
  EXIT=$?
}

pass() {
  PASSED=$((PASSED + 1))
  printf '  ok   %s\n' "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf '  FAIL %s\n     %s\n' "$1" "$2" >&2
}

# exit 2 is the contract: the runtime treats it as "blocked" and feeds stderr back to the
# agent. An exit code of 1 would let the command through, so the number is asserted, not
# just "non-zero".
# The optional fourth argument pins *why* it was blocked. Without it a case can go green
# because some unrelated rule happened to fire, which is how a deleted guard stays invisible:
# deleting the option-skip arm of the refspec loop once left this whole suite passing.
expect_block() {
  local hook="$1" command="$2" name="$3" reason="${4-}"
  run_hook "$hook" "$command"
  if [ "$EXIT" -ne 2 ]; then
    fail "$name" "expected exit 2, got $EXIT"
  elif [ -z "$STDERR" ]; then
    fail "$name" "blocked with no explanation on stderr"
  elif [ -n "$reason" ] && ! printf '%s' "$STDERR" | grep -qF -- "$reason"; then
    fail "$name" "blocked for the wrong reason: $STDERR"
  else
    pass "$name"
  fi
}

expect_allow() {
  local hook="$1" command="$2" name="$3"
  run_hook "$hook" "$command"
  if [ "$EXIT" -ne 0 ]; then
    fail "$name" "expected exit 0, got $EXIT: $STDERR"
  else
    pass "$name"
  fi
}

expect_stderr_lacks() {
  local needle="$1" name="$2"
  if printf '%s' "$STDERR" | grep -qF -- "$needle"; then
    fail "$name" "stderr contains '$needle'"
  else
    pass "$name"
  fi
}

echo "guard-bash.sh — package manager"
expect_block guard-bash.sh 'npm install' 'npm install'
expect_block guard-bash.sh 'yarn add lodash' 'yarn add'
expect_block guard-bash.sh 'sudo npm i' 'npm behind sudo'
expect_block guard-bash.sh 'env FOO=1 npm i' 'npm behind env'
expect_block guard-bash.sh 'command npm i' 'npm behind command'
expect_block guard-bash.sh 'CI=1 npm ci' 'npm behind an inline assignment'
expect_block guard-bash.sh 'pnpm build && npm i' 'npm after &&'
expect_allow guard-bash.sh 'pnpm install' 'pnpm install'
expect_allow guard-bash.sh 'git commit -m "docs: explain why npm is not used"' 'npm named inside a commit message'

echo "guard-bash.sh — routes around the secret scan"
expect_block guard-bash.sh 'git commit --no-verify -m "wip"' '--no-verify'
expect_block guard-bash.sh 'git commit -n -m "wip"' '-n'
expect_block guard-bash.sh 'HUSKY=0 git commit -m "wip"' 'HUSKY=0'
expect_block guard-bash.sh 'git -c core.hooksPath=/dev/null commit -m "wip"' 'core.hooksPath'
expect_block guard-bash.sh 'git push --no-verify' '--no-verify on push'
expect_allow guard-bash.sh 'git commit -m "feat(F1.9): verify the guards"' 'ordinary commit'
# Both spellings have to belong to the git invocation. Testing "is -n present" and "is git
# commit present" independently refused an ordinary grep and blamed a secret for it.
expect_allow guard-bash.sh 'grep -n "git push" .claude/README.md' 'a grep whose pattern mentions git push'
expect_allow guard-bash.sh 'grep -rn "no-verify" .claude' 'a grep for the word no-verify'
# The flag after the message is the order everyone types, and every commit message here is
# quoted by convention — so a check that stops at the first quote stops before the flag.
expect_block guard-bash.sh 'git commit -m "wip" -n' '-n after a quoted message'
expect_block guard-bash.sh 'git commit -am "wip" -n' '-n after -am'
expect_block guard-bash.sh 'git commit --amend -n' '-n on an amend'
# A separator inside the message must not end the search for the flag either.
expect_block guard-bash.sh 'git commit -m "fix: a; then b" --no-verify' '--no-verify after a message containing a semicolon'
expect_block guard-bash.sh 'git commit -m "feat: a|b" --no-verify' '--no-verify after a message containing a pipe'
expect_block guard-bash.sh 'git -C /tmp/repo commit --no-verify -m wip' '--no-verify behind git -C'
expect_allow guard-bash.sh 'git commit -m "docs: use grep -n to number lines"' 'a commit message that merely contains -n'
expect_allow guard-bash.sh 'git commit -m "docs: explain why --no-verify is blocked"' 'a commit message that merely contains --no-verify'
expect_allow guard-bash.sh 'git commit --amend --no-edit' 'an amend with no message flag'
# `-n` bundles with git's other short flags, and the bundle skips the hook just as well — a
# reviewer demonstrated `git commit -nm` creating a commit with the pre-commit hook unrun.
expect_block guard-bash.sh 'git commit -nm "wip"' '-n bundled with -m'
expect_block guard-bash.sh 'git commit -anm "wip"' '-n bundled with -a and -m'
expect_block guard-bash.sh 'git commit -vn -m "wip"' '-n bundled with -v'
# Grouping is the shell's, not the command's: these are the same commit.
expect_block guard-bash.sh '(git commit -n -m "wip")' '-n on a commit inside a subshell'
expect_block guard-bash.sh '{ git commit --no-verify -m "wip"; }' '--no-verify on a commit inside a group'
# A nested command keeps the outer command's first word unless the opener becomes a
# separator, and then it matches nothing.
expect_block guard-bash.sh 'echo $(npm install)' 'npm inside a command substitution'
expect_block guard-bash.sh 'xargs git commit --no-verify -m wip' '--no-verify behind xargs'
expect_block guard-bash.sh 'pnpm exec git commit --no-verify -m wip' '--no-verify behind pnpm exec'
# One unrecognised word before `git` used to switch every check off. These are retry idioms
# and ordinary wrappers, not evasions — which is exactly why they have to be caught.
expect_block guard-bash.sh 'eval git commit --no-verify -m x' '--no-verify behind eval'
expect_block guard-bash.sh 'stdbuf -o0 git commit --no-verify -m x' '--no-verify behind stdbuf'
expect_block guard-bash.sh 'if ! git commit --no-verify -m x; then echo; fi' '--no-verify inside an if !'
expect_block guard-bash.sh 'for f in a; do git commit -n -m x; done' '-n inside a for loop'
expect_block guard-bash.sh 'cat msg.txt | git commit --no-verify -F -' '--no-verify after a pipe'
expect_block guard-bash.sh 'GIT_EDITOR="code -w" git commit --no-verify -m x' '--no-verify after an assignment whose value is quoted and contains a space'
expect_block guard-bash.sh "GIT_EDITOR='code -w' git commit --no-verify -m x" '--no-verify after a single-quoted assignment value'
# eval runs the string it is handed, so those quotes are eval's, not the command's.
expect_block guard-bash.sh "eval 'git commit -n -m x'" '-n inside a single-quoted eval payload'
expect_block guard-bash.sh 'eval "git commit --no-verify -m x"' '--no-verify inside a double-quoted eval payload'
# Searching for the text of a guarded spelling is not that spelling.
expect_allow guard-bash.sh 'grep -rn "HUSKY=0" .' 'a search for the text HUSKY=0'
expect_allow guard-bash.sh 'grep -n "core.hooksPath value" file' 'a search for the text core.hooksPath'
expect_allow guard-bash.sh 'grep -c "HUSKY=0" file' 'a counting grep, whose -c is not gits'
# bash removes every quote before the program sees the value, so a wholly quoted setting is
# the same setting. What tells a setting from a search is where it sits, not how it is quoted.
expect_block guard-bash.sh 'env "HUSKY=0" git commit -m x' 'a wholly quoted HUSKY assignment after env'
expect_block guard-bash.sh "env 'HUSKY=0' git commit -m x" 'a single-quoted HUSKY assignment after env'
expect_block guard-bash.sh 'sudo env HUSKY=0 git commit -m x' 'a HUSKY assignment behind two wrappers'
expect_block guard-bash.sh 'git -c "core.hooksPath=/dev/null" commit -m x' 'a wholly quoted hooksPath override'
expect_block guard-bash.sh "git -c 'core.hooksPath=/dev/null' commit -m x" 'a single-quoted hooksPath override'
expect_allow guard-bash.sh "git commit -m 'docs: use grep -n to number lines'" 'a single-quoted message that merely contains -n'
expect_allow guard-bash.sh 'grep -n "hooksPath\|npm after" .claude/hooks/guard-bash.sh' 'a grep whose quoted pattern contains an alternation and the word npm'
# HUSKY reads the value bash hands it, so the quotes are not a different command.
expect_block guard-bash.sh 'HUSKY="0" git commit -m "wip"' 'a quoted HUSKY=0'
# The -c form lasts one command; `git config` writes it into the repository.
expect_block guard-bash.sh 'git config core.hooksPath /dev/null' 'core.hooksPath set persistently'

echo "guard-bash.sh — pushing to main"
NAMES_MAIN='main takes changes through a PR only'
CURRENT_IS_MAIN='this pushes the current branch'

expect_block guard-bash.sh 'git push origin main' 'push origin main' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin master' 'push origin master' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin HEAD:main' 'push HEAD:main' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin main:refs/heads/main' 'push with a src:dst refspec' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin refs/heads/main' 'push a fully qualified ref' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push -u origin main' 'push with -u' "$NAMES_MAIN"
expect_block guard-bash.sh 'git -C /tmp/repo push origin main' 'push behind git -C' "$NAMES_MAIN"
expect_block guard-bash.sh 'git --no-pager push origin main' 'push behind a global option' "$NAMES_MAIN"
# A leading + forces the push, and `git push --force` in the deny list does not see it.
expect_block guard-bash.sh 'git push origin +main' 'force-push spelled as a + refspec' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin +refs/heads/main' 'forced fully qualified ref' "$NAMES_MAIN"
# Only the last push of a chain used to be inspected, so the verdict depended on the order.
expect_block guard-bash.sh 'git push origin main && git push origin F9.9-feature' 'push to main as the first leg of a chain' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin main; git status' 'push to main followed by another command' "$NAMES_MAIN"
# bash strips these before git sees them, so a guard that does not is reading a different
# command than the one that runs. Verified by a reviewer against a real bare remote.
expect_block guard-bash.sh 'git push origin "main"' 'push to a double-quoted main' "$NAMES_MAIN"
expect_block guard-bash.sh "git push origin 'main'" 'push to a single-quoted main' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push "origin" "main"' 'push with both words quoted' "$NAMES_MAIN"
expect_block guard-bash.sh '(git push origin main)' 'push inside a subshell' "$NAMES_MAIN"
expect_block guard-bash.sh '{ git push origin main; }' 'push inside a group' "$NAMES_MAIN"
# A backslash continuation is one command written across lines.
expect_block guard-bash.sh "$(printf 'git push origin \\\n  main')" 'push to main across a line continuation' "$NAMES_MAIN"
# Wrappers that were not in the peel list.
expect_block guard-bash.sh 'timeout 60 git push origin main' 'push behind timeout' "$NAMES_MAIN"
expect_block guard-bash.sh 'nohup git push origin main' 'push behind nohup' "$NAMES_MAIN"
# A wildcard refspec publishes every branch it matches, whatever is checked out.
expect_block guard-bash.sh "git push origin 'refs/heads/*:refs/heads/*'" 'push with a wildcard refspec' 'wildcard refspec'
expect_allow guard-bash.sh 'git push -u origin F1.9-add-ticket-workflow-commands' 'push a feature branch'
expect_allow guard-bash.sh 'git commit -m "note: push to main goes through a PR"' 'the word push inside a message'

# A bare push names no refspec, so git publishes the current branch — the accidental way
# onto main, and the likelier one. What decides is the branch, so the repository is the
# fixture here.
PROJECT_DIR="$REPO_MAIN"
expect_block guard-bash.sh 'git push' 'bare push while on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'git push origin' 'push with a remote but no refspec, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'git push && echo done' 'bare push chained with &&' "$CURRENT_IS_MAIN"
# The option-skip arm of the refspec loop is what makes this one "no refspec named". Deleting
# that arm left the whole suite green until this case existed.
expect_block guard-bash.sh 'git push -u origin' 'push with options but no refspec, on main' "$CURRENT_IS_MAIN"
# sed is line-oriented, so a push on the second line used to inherit the first line's words
# as its refspecs — and multi-line commands are the ordinary shape in a session.
expect_block guard-bash.sh "$(printf 'echo hello\ngit push')" 'bare push on the second line, on main' "$CURRENT_IS_MAIN"
# HEAD and @ are the same push spelled without the branch name, which is why they are
# reached for — two tokens, so the no-refspec check never sees them.
expect_block guard-bash.sh 'git push origin HEAD' 'push origin HEAD while on main' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin @' 'push origin @ while on main' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push --set-upstream origin HEAD' 'push origin HEAD with --set-upstream' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin +HEAD' 'forced push of HEAD while on main' "$NAMES_MAIN"
# Unquoted expansion would otherwise glob against the hook's working directory, so the same
# command would be judged by how many files happen to sit there.
expect_block guard-bash.sh 'git push *' 'push with a glob, on main' 'wildcard refspec'
# A compound statement is still a push; so is one nested in a command substitution, where the
# inline-assignment peel used to eat the verb along with the assignment.
expect_block guard-bash.sh 'if git push origin; then echo ok; fi' 'push inside an if, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'test -f x && { git push origin; }' 'push inside a group after &&, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'OUT=$(git push origin)' 'push inside a command substitution, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'echo $(git push origin main)' 'push nested in a command substitution behind another command' "$NAMES_MAIN"
expect_block guard-bash.sh 'eval git push origin main' 'push behind eval' "$NAMES_MAIN"
expect_block guard-bash.sh 'stdbuf -o0 git push origin main' 'push behind stdbuf' "$NAMES_MAIN"
expect_block guard-bash.sh 'while ! git push origin main; do sleep 1; done' 'push to main inside a retry loop' "$NAMES_MAIN"
expect_block guard-bash.sh 'yes | git push origin main' 'push to main after a pipe' "$NAMES_MAIN"
expect_block guard-bash.sh 'GIT_SSH_COMMAND="ssh -i key" git push origin main' 'push after an assignment whose value is quoted and contains a space' "$NAMES_MAIN"
# On push, -n is --dry-run: it writes to no remote.
expect_allow guard-bash.sh 'git push -n' 'a -n dry-run push while on main'
# --tags publishes refs/tags and no branch, so it is not a push of what is checked out.
expect_allow guard-bash.sh 'git push origin --tags' 'a tags-only push while on main'
expect_block guard-bash.sh 'git push origin --tags main' 'a tags push that also names main' "$NAMES_MAIN"
expect_block guard-bash.sh "GIT_SSH_COMMAND='ssh -i key' git push origin main" 'push after a single-quoted assignment value' "$NAMES_MAIN"
expect_block guard-bash.sh "eval 'git push origin main'" 'push inside a single-quoted eval payload' "$NAMES_MAIN"
# The value of an option that takes a separate word is not a refspec.
expect_block guard-bash.sh 'git push -o ci.skip origin' 'push whose only refspec-looking token is an option value, on main' "$CURRENT_IS_MAIN"
# These write to no remote at all.
expect_allow guard-bash.sh 'git push --dry-run' 'a dry-run push while on main'
expect_allow guard-bash.sh 'git push --help' 'git push --help while on main'
expect_allow guard-bash.sh 'git commit -m "remember to git push after"' 'a commit message about pushing, on main'
expect_allow guard-bash.sh 'gh pr comment 51 --body "rerun git push origin"' 'a PR comment quoting a push command'
PROJECT_DIR="$REPO_FEATURE"
expect_allow guard-bash.sh 'git push' 'bare push while on a feature branch'
expect_allow guard-bash.sh 'git push -u origin' 'push with -u and no refspec, on a feature branch'
expect_allow guard-bash.sh 'git push origin HEAD' 'push origin HEAD from a feature branch'
expect_block guard-bash.sh 'git push origin main && git push origin F9.9-some-feature' 'a chain whose first leg targets main' "$NAMES_MAIN"
# These publish every branch, main included, whatever is checked out.
expect_block guard-bash.sh 'git push --all origin' 'push --all from a feature branch'
expect_block guard-bash.sh 'git push --mirror origin' 'push --mirror from a feature branch'
PROJECT_DIR="$REPO_MASTER"
expect_block guard-bash.sh 'git push' 'bare push while on master' "$CURRENT_IS_MAIN"
PROJECT_DIR="$SANDBOX"
expect_allow guard-bash.sh 'git push' 'bare push outside a repository — nothing to verify'

echo "guard-bash.sh — destructive deletes"
expect_block guard-bash.sh 'rm -rf --no-preserve-root /' '--no-preserve-root'
expect_block guard-bash.sh 'rm -rf /' 'rm -rf /'
expect_block guard-bash.sh 'rm -rf ~' 'rm -rf ~'
expect_block guard-bash.sh 'rm -rf ..' 'rm -rf ..'
expect_block guard-bash.sh 'rm -rf *' 'rm -rf *'
expect_block guard-bash.sh 'rm -fr /Users/someone' 'rm -fr with the flags reversed'
expect_allow guard-bash.sh 'rm -rf ./node_modules' 'rm -rf of a named path'
expect_allow guard-bash.sh 'rm -rf apps/web/.next' 'rm -rf of a build directory'

echo "guard-bash.sh — malformed input"
expect_allow guard-bash.sh '' 'empty command'
printf 'not json' | env -u DATABASE_URL CLAUDE_PROJECT_DIR="$SANDBOX" "$HOOKS_DIR/guard-bash.sh" >/dev/null 2>&1
RAW_EXIT=$?
if [ "$RAW_EXIT" -eq 0 ]; then
  pass 'unparseable payload'
else
  fail 'unparseable payload' "expected exit 0, got $RAW_EXIT"
fi

echo "guard-db.sh — destructive commands away from the local database"
DB_URL="postgresql://rondo:local@localhost:5432/rondo"
expect_allow guard-db.sh 'pnpm db:migrate' 'migrate against localhost'
expect_allow guard-db.sh 'pnpm db:deploy' 'deploy against localhost'
expect_allow guard-db.sh 'pnpm --filter @rondo/db exec prisma migrate reset' 'reset against localhost'
expect_allow guard-db.sh 'pnpm test' 'a command that destroys nothing'

DB_URL="postgresql://rondo:local@127.0.0.1:5432/rondo"
expect_allow guard-db.sh 'pnpm db:migrate' 'migrate against 127.0.0.1'
DB_URL="postgresql://rondo:local@[::1]:5432/rondo"
expect_allow guard-db.sh 'pnpm db:migrate' 'migrate against an IPv6 literal'
DB_URL="postgresql://rondo:local@host.docker.internal:5432/rondo"
expect_allow guard-db.sh 'pnpm db:migrate' 'migrate against the Docker host alias'

DB_URL="postgresql://rondo:not-a-real-password@db.railway.internal:5432/railway"
expect_block guard-db.sh 'pnpm db:deploy' 'deploy against a remote database'
expect_block guard-db.sh 'pnpm db:migrate' 'migrate against a remote database'
expect_block guard-db.sh 'pnpm --filter @rondo/db exec prisma migrate reset' 'prisma migrate reset against a remote database'
expect_block guard-db.sh 'pnpm --filter @rondo/db exec prisma migrate deploy' 'prisma migrate deploy against a remote database'
expect_block guard-db.sh 'pnpm --filter @rondo/db exec prisma db push' 'prisma db push against a remote database'
expect_block guard-db.sh 'psql -c "DROP TABLE user_settings"' 'DROP TABLE against a remote database'
# SQL is case-insensitive and so is the guard; without a case this arm can be narrowed
# without anything noticing.
expect_block guard-db.sh 'psql -c "drop table user_settings"' 'lowercase drop table against a remote database'
expect_block guard-db.sh 'psql -c "TRUNCATE user_settings"' 'TRUNCATE against a remote database'
expect_block guard-db.sh 'dropdb railway' 'dropdb against a remote database'
expect_allow guard-db.sh 'pnpm --filter @rondo/db exec prisma studio' 'a read-only command against a remote database'

# The hook must name the host and nothing else: a destructive command can carry its own
# credentials inline, and repeating the command back would write them into the transcript.
DB_URL=""
expect_block guard-db.sh 'DATABASE_URL=postgresql://rondo:not-a-real-password@db.railway.internal:5432/railway pnpm db:deploy' 'inline remote DATABASE_URL'
expect_stderr_lacks 'not-a-real-password' 'the refusal does not echo the password'
expect_block guard-db.sh 'pnpm --filter @rondo/db exec prisma db execute --url postgresql://rondo:not-a-real-password@db.railway.internal:5432/railway --file drop.sql' 'remote --url'
expect_stderr_lacks 'not-a-real-password' 'the refusal does not echo the password from --url'

# An inline assignment overrides the environment, so the environment alone must not clear it.
DB_URL="postgresql://rondo:local@localhost:5432/rondo"
expect_block guard-db.sh 'DATABASE_URL=postgresql://rondo:remote@db.railway.internal:5432/railway pnpm db:deploy' 'inline remote target beats a local environment'
expect_allow guard-db.sh 'DATABASE_URL=postgresql://rondo:local@localhost:5432/rondo pnpm db:migrate' 'inline local target'

# Unverifiable is not the same as safe.
DB_URL=""
expect_block guard-db.sh 'pnpm db:deploy' 'destructive command with no DATABASE_URL at all'
expect_allow guard-db.sh 'pnpm build' 'harmless command with no DATABASE_URL'

echo "stop-docs-drift.sh — the document an area left behind"

# Staged files show in `git status --porcelain` one path per line, so a fixture needs no
# commit: create what "changed" in a fresh repository and stage it.
stop_fixture() {
  local repo="$SANDBOX/stop-$1" file
  shift
  rm -rf "$repo"
  git init -q -b main "$repo"
  for file in "$@"; do
    mkdir -p "$repo/$(dirname "$file")"
    printf 'x\n' >"$repo/$file"
  done
  git -C "$repo" add -A 2>/dev/null
  printf '%s' "$repo"
}

# The same thing left unstaged — the shape the hook actually meets at Stop, and the one where
# git collapses a new directory to a single entry unless it is asked not to.
stop_fixture_untracked() {
  local repo="$SANDBOX/stop-$1" file
  shift
  rm -rf "$repo"
  git init -q -b main "$repo"
  for file in "$@"; do
    mkdir -p "$repo/$(dirname "$file")"
    printf 'x\n' >"$repo/$file"
  done
  printf '%s' "$repo"
}

expect_names() {
  local repo="$1" needle="$2" name="$3" out
  out=$(CLAUDE_PROJECT_DIR="$repo" "$HOOKS_DIR/stop-docs-drift.sh" 2>/dev/null)
  if printf '%s' "$out" | grep -qF -- "$needle"; then
    pass "$name"
  else
    fail "$name" "expected the reminder to name '$needle', got: ${out:-<silence>}"
  fi
}

expect_quiet_about() {
  local repo="$1" needle="$2" name="$3" out
  out=$(CLAUDE_PROJECT_DIR="$repo" "$HOOKS_DIR/stop-docs-drift.sh" 2>/dev/null)
  if printf '%s' "$out" | grep -qF -- "$needle"; then
    fail "$name" "reminder named '$needle' although its document was updated"
  else
    pass "$name"
  fi
}

expect_names "$(stop_fixture ci .github/workflows/ci.yml)" 'docs/ci.md' \
  'a workflow changed, docs/ci.md did not'
expect_quiet_about "$(stop_fixture ci-swept .github/workflows/ci.yml docs/ci.md)" 'docs/ci.md' \
  'a workflow changed and docs/ci.md with it'

# The regression that motivated the rewrite: the previous version went silent as soon as any
# .md was touched, so a session that edited an unrelated README hid every stale document
# behind it.
expect_names "$(stop_fixture ci-unrelated-prose .github/workflows/ci.yml README.md)" 'docs/ci.md' \
  'unrelated prose does not hide a stale document'

expect_names "$(stop_fixture workspace apps/web/src/page.tsx)" 'apps/web/README.md' \
  'workspace code changed, its README did not'
expect_quiet_about "$(stop_fixture workspace-swept apps/web/src/page.tsx apps/web/README.md)" 'apps/web/README.md' \
  'workspace code changed and its README with it'
expect_names "$(stop_fixture agent-setup .claude/hooks/new-guard.sh)" '.claude/README.md' \
  'the agent setup changed, its README did not'
expect_names "$(stop_fixture_untracked new-workspace apps/newapp/src/index.ts)" 'apps/newapp/README.md' \
  'a brand-new untracked workspace is named, not collapsed to one entry'
expect_quiet_about "$(stop_fixture prose-only README.md)" 'stale' \
  'prose alone is not a reason to warn'
# Rewritten by `next dev` on every e2e run and never committed — a nag about it every time
# is how a hook gets ignored.
expect_quiet_about "$(stop_fixture e2e-artefact apps/web/next-env.d.ts)" 'stale' \
  'the next-env.d.ts an e2e run rewrites is not changed code'
expect_quiet_about "$(stop_fixture untouched)" 'stale' \
  'a clean tree says nothing'

echo
if [ "$FAILED" -gt 0 ]; then
  printf '%d passed, %d FAILED\n' "$PASSED" "$FAILED" >&2
  exit 1
fi
printf '%d passed\n' "$PASSED"
