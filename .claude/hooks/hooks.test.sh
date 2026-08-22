#!/usr/bin/env bash
# Tests for the guard hooks and for check-docs.mjs. Run: pnpm test:hooks (also part of /check
# and the CI gate).
#
# Why they exist: guard-bash.sh and guard-db.sh are the only mechanical stop between an
# agent's shortcut and a burned secret or a wiped remote database, and neither announces a
# miss. guard-db.sh pattern-matches the command string, so a pattern that quietly stops
# matching still exits 0; guard-bash.sh tokenises the command first, which removes that whole
# class but not the risk of being wrong about which words matter. Either way the failure is
# silence — the same reason ADR-005 refused to leave raw SQL to a convention. Review has
# closed real bypasses in these scripts, so the cases below are adversarial by design: every wrapper, spelling and refspec form the
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

# The two refusals a push can draw, kept here because several blocks pin which one fired.
NAMES_MAIN='main takes changes through a PR only'
CURRENT_IS_MAIN='this pushes the current branch'

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

echo "guard-bash.sh — the command is words, not text"
# Everything in this block was allowed while the guard matched patterns against the command
# string. They are one bug, not nineteen: quoting, grouping, a keyword and a wrapper's own
# option each defeated a different syntactic tell. Reading the command as the shell reads it —
# words, with quoting resolved once — is what makes them all the same case.
expect_block guard-bash.sh 'git commit "--no-verify" -m x' 'a quoted --no-verify is still the flag'
expect_block guard-bash.sh 'git commit "-n" -m x' 'a quoted -n is still the flag'
expect_block guard-bash.sh 'env -i HUSKY=0 git commit -m x' 'HUSKY behind an env option'
expect_block guard-bash.sh 'env -u FOO HUSKY=0 git commit -m x' 'HUSKY behind an env option that takes a value'
expect_block guard-bash.sh 'sudo -E git push origin main' 'push behind a wrapper carrying its own flag' "$NAMES_MAIN"
expect_block guard-bash.sh 'nice -n 10 git push origin main' 'push behind a wrapper option that takes a value' "$NAMES_MAIN"
expect_block guard-bash.sh 'xargs -I{} git push origin main' 'push behind xargs with a replace string' "$NAMES_MAIN"
expect_block guard-bash.sh 'command -p git push origin main' 'push behind command -p' "$NAMES_MAIN"
expect_block guard-bash.sh 'sudo -E npm install' 'npm behind a wrapper carrying its own flag'
expect_block guard-bash.sh '(HUSKY=0 git commit -m x)' 'HUSKY inside a subshell'
expect_block guard-bash.sh '{ HUSKY=0 git commit -m x; }' 'HUSKY inside a group'
expect_block guard-bash.sh 'if HUSKY=0 git commit -m x; then echo ok; fi' 'HUSKY inside an if'
expect_block guard-bash.sh 'for f in a; do HUSKY=0 git commit -m x; done' 'HUSKY inside a for loop'
expect_block guard-bash.sh 'timeout 60 HUSKY=0 git commit -m x' 'HUSKY behind timeout'
expect_block guard-bash.sh '(git -c core.hooksPath=/dev/null commit -m x)' 'a hooksPath override inside a subshell'
expect_block guard-bash.sh 'if true; then npm install; fi' 'npm inside an if'
expect_block guard-bash.sh 'for f in a; do npm install; done' 'npm inside a for loop'
# The same reading is what keeps ordinary work allowed: a quoted argument is one word, so text
# inside it is never a flag, and a command that merely names another is not that command.
expect_allow guard-bash.sh 'grep -n "git commit --no-verify" file' 'a search for the text of a guarded command'
expect_allow guard-bash.sh 'pnpm exec playwright install chromium' 'a local binary run through pnpm exec'
# An exported assignment outlives the command that made it — one Bash call is one shell.
expect_block guard-bash.sh 'export HUSKY=0 && git commit -m x' 'HUSKY exported before the commit'
expect_block guard-bash.sh 'export HUSKY=0; git commit -m x' 'HUSKY exported in a separate statement'
expect_block guard-bash.sh 'declare -x HUSKY=0 && git commit -m x' 'HUSKY exported through declare'
# `command -v` looks a name up rather than running it, and reading a config is not writing it.
expect_allow guard-bash.sh 'command -v npm' 'looking up where npm is'
expect_allow guard-bash.sh 'git config --get core.hooksPath' 'reading the hooksPath setting'
expect_allow guard-bash.sh 'git config --list' 'listing the git config'

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
# Double quotes suppress word splitting, not execution — bash runs these too.
expect_block guard-bash.sh 'echo "$(npm install)"' 'npm substituted inside double quotes'
expect_block guard-bash.sh 'echo "$(git push origin main)"' 'push substituted inside double quotes' "$NAMES_MAIN"
expect_block guard-bash.sh 'echo "`git push origin main`"' 'push backtick-substituted inside double quotes' "$NAMES_MAIN"
expect_block guard-bash.sh 'X="$(git commit --no-verify -m x)"' '--no-verify substituted into an assignment'
expect_allow guard-bash.sh 'git commit -m "wip $(date)"' 'a harmless substitution inside a commit message'
# A shell handed a command string with -c runs it — the same shape as eval, so it is read the
# same way. What runs on another machine (`ssh host "…"`) is a different matter and stays out.
expect_block guard-bash.sh 'bash -c "git commit --no-verify -m x"' '--no-verify inside a bash -c payload'
expect_block guard-bash.sh 'sh -c "git push origin main"' 'push to main inside an sh -c payload' "$NAMES_MAIN"
expect_block guard-bash.sh "zsh -c 'npm install'" 'npm inside a zsh -c payload'
expect_block guard-bash.sh 'bash -lc "git commit -n -m x"' '-n inside a bundled -lc payload'
expect_allow guard-bash.sh 'bash -c "echo hello"' 'a harmless bash -c payload'
expect_allow guard-bash.sh 'bash script.sh' 'running a script file, whose contents this guard does not read'
# `$'…'` and `$"…"` are quoting forms too: bash drops the `$`, so these are the same words.
expect_block guard-bash.sh "git push origin HEAD:\$'main'" 'a destination in ANSI-C quotes' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push origin HEAD:$"main"' 'a destination in locale-translated quotes' "$NAMES_MAIN"
expect_block guard-bash.sh "\$'npm' install" 'npm named in ANSI-C quotes'
expect_block guard-bash.sh "git commit -m x \$'-n'" '-n written in ANSI-C quotes'
# A statement that is only an assignment has no command of its own; one Bash call is one shell.
expect_block guard-bash.sh 'set -a; HUSKY=0; git commit -m x' 'HUSKY set as its own statement under set -a'
expect_block guard-bash.sh 'HUSKY=0; export HUSKY; git commit -m x' 'HUSKY assigned then exported separately'
# The subcommand is found by name, so an unlisted global that takes a value cannot stand in it.
expect_block guard-bash.sh 'git --attr-source HEAD push origin +feat:main' 'push behind an unlisted global option' "$NAMES_MAIN"
expect_block guard-bash.sh 'git --config-env core.dummy=HOME push origin main' 'push behind --config-env' "$NAMES_MAIN"
expect_block guard-bash.sh 'git --attr-source HEAD commit --no-verify -m x' '--no-verify behind an unlisted global option'
expect_block guard-bash.sh 'git --git-dir x/.git push origin main' 'push behind --git-dir' "$NAMES_MAIN"
# git accepts any unambiguous abbreviation of a long option.
expect_block guard-bash.sh 'git commit -m x --no-veri' 'an abbreviated --no-verify'
expect_block guard-bash.sh 'git push --no-veri origin HEAD' 'an abbreviated --no-verify on push'
# An unqualified destination resolves against the refs the remote already has.
expect_block guard-bash.sh 'git push origin HEAD:heads/main' 'a heads/ destination' "$NAMES_MAIN"
# `-n` as the value of an option is not --dry-run.
expect_block guard-bash.sh 'git push -o -n origin HEAD:main' '-n as a push-option value' "$NAMES_MAIN"
expect_block guard-bash.sh 'git push --push-option -n origin HEAD:main' '-n as a --push-option value' "$NAMES_MAIN"
# send-pack is push by another name.
expect_block guard-bash.sh 'git send-pack origin +feat:main' 'send-pack to main' "$NAMES_MAIN"
# `env -S` splits its argument into a command and runs it — eval's shape again.
expect_block guard-bash.sh 'env -S "HUSKY=0 git commit -n -m x"' 'HUSKY inside an env split-string'
expect_block guard-bash.sh 'env --split-string="git push origin main"' 'push inside an env split-string' "$NAMES_MAIN"
# A leading redirection is not the command; treating it as one silenced every rule.
expect_block guard-bash.sh '2>/dev/null git commit --no-verify -m x' '--no-verify behind a leading redirection'
expect_block guard-bash.sh '2>/dev/null git push origin main' 'push to main behind a leading redirection' "$NAMES_MAIN"
# The value of a global option is not the subcommand — and a subcommand we have no rule for
# ends the search, so an argument that merely looks like one is not read as a command.
expect_block guard-bash.sh 'git -C config push origin main' 'push whose -C value spells a subcommand' "$NAMES_MAIN"
expect_allow guard-bash.sh 'git grep push' 'a search for the word push'
expect_allow guard-bash.sh 'git log --oneline main' 'a log of main'
# Judged by where the path leads, so a Linux root is no different from a macOS one.
expect_block guard-bash.sh 'rm -rf /tmp/cache' 'rm -rf of a path outside the project'
expect_block guard-bash.sh 'rm -rf /home/user/data' 'rm -rf of a Linux home path'
# Wrappers and keywords the suite did not pin before.
expect_block guard-bash.sh 'exec git push origin main' 'push behind exec' "$NAMES_MAIN"
expect_block guard-bash.sh 'time git push origin main' 'push behind time' "$NAMES_MAIN"
expect_block guard-bash.sh 'until git push origin main; do sleep 1; done' 'push to main inside an until loop' "$NAMES_MAIN"
# A comment is text bash never runs.
expect_allow guard-bash.sh 'rm -rf tmp # careful with ..' 'a comment mentioning a reckless path'
expect_allow guard-bash.sh 'git push origin feature-x # not main' 'a comment mentioning main'
expect_allow guard-bash.sh 'git commit -m "wip" # do not use -n here' 'a comment mentioning -n'
# In a short-flag cluster the first value-taking option swallows the rest as its value.
expect_allow guard-bash.sh 'git commit -uno -m wip' '-uno, which is --untracked-files=no'
expect_allow guard-bash.sh 'git commit -m"nit"' 'a message attached to -m'
expect_allow guard-bash.sh 'git commit -am"note"' 'a message attached to -am'
expect_allow guard-bash.sh 'git config --get-all core.hooksPath' 'reading every value of the setting'
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
# No command here deletes a remote branch — /close-ticket offers, a human runs it. Pinned anyway,
# because that is the spelling a human reaches for, and the guard's job is to tell a feature
# branch from main when they do.
expect_allow guard-bash.sh 'git push origin --delete F1.9-add-ticket-workflow-commands' 'deleting a merged feature branch on the remote'
expect_block guard-bash.sh 'git push origin --delete main' 'deleting main on the remote' "$NAMES_MAIN"
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
# A redirection target is not a refspec; counting it made the push look deliberate enough to
# skip the current-branch check, and only in some spellings.
expect_block guard-bash.sh 'git push > /tmp/log' 'a bare push whose output is redirected, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'git push origin > log' 'a push to a remote with output redirected, on main' "$CURRENT_IS_MAIN"
expect_block guard-bash.sh 'git push 2> err' 'a push with stderr redirected in two words, on main' "$CURRENT_IS_MAIN"
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
expect_block guard-bash.sh 'rm -rf --no-preserve-root /' '--no-preserve-root' 'no-preserve-root'
# Without a reason, this case was satisfied by the reckless-target rule firing instead, so the
# arm could be deleted with the suite still green — the defect the fourth argument exists for.
expect_block guard-bash.sh 'rm -rf --no-preserve-root ./tmp' '--no-preserve-root on a harmless path' 'no-preserve-root'
expect_block guard-bash.sh 'rm -rf /' 'rm -rf /'
expect_block guard-bash.sh 'rm -rf ~' 'rm -rf ~'
expect_block guard-bash.sh 'rm -rf ..' 'rm -rf ..'
expect_block guard-bash.sh 'rm -rf *' 'rm -rf *'
expect_block guard-bash.sh 'rm -fr /Users/someone' 'rm -fr with the flags reversed'
# Judged by shape: a path that walks out of the project, or a glob standing for everything a
# root holds, is the same delete however it is spelled.
expect_block guard-bash.sh 'rm -rf ../node_modules' 'rm -rf of a path outside the project'
expect_block guard-bash.sh 'rm -rf ../..' 'rm -rf two levels up'
expect_block guard-bash.sh 'rm -rf /*' 'rm -rf of everything under root'
expect_block guard-bash.sh 'rm -rf ./*' 'rm -rf of everything here'
expect_block guard-bash.sh 'rm -Rf /*' 'rm with a capital R'
expect_block guard-bash.sh 'rm --recursive --force /' 'rm with the long flag spellings'
expect_allow guard-bash.sh 'rm -rf ./node_modules' 'rm -rf of a named path'
expect_allow guard-bash.sh 'rm -rf apps/web/.next' 'rm -rf of a build directory'
expect_allow guard-bash.sh 'rm -rf dist/bundle' 'rm -rf inside the project'
expect_block guard-bash.sh 'rm -rf .' 'rm -rf of the working directory'
expect_block guard-bash.sh 'rm -rf ~/anything' 'rm -rf inside a home directory'
expect_block guard-bash.sh 'rm -rf ~someone' 'rm -rf of another user home'
# A path inside the project is ordinary work however it is spelled, and this environment asks
# for absolute paths — so the recommended spelling must not be the refused one. The fixture
# needs a project directory under the same root the rule guards; it need not exist.
PROJECT_DIR="/Users/fixture-project"
expect_allow guard-bash.sh 'rm -rf /Users/fixture-project/node_modules' 'an absolute path inside the project'
expect_allow guard-bash.sh 'rm -rf /Users/fixture-project/apps/web/.next' 'an absolute build path inside the project'
expect_block guard-bash.sh 'rm -rf /Users/fixture-project' 'the project directory itself'
expect_block guard-bash.sh 'rm -rf /Users/someone-else/work' 'an absolute path outside the project'
PROJECT_DIR="$SANDBOX"

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
expect_quiet_about "$(stop_fixture untouched)" 'stale' \
  'a clean tree says nothing'

# --- check-docs.mjs -----------------------------------------------------------------
# Same failure mode as the guards: an owned phrase that stops matching, or a pattern that
# no longer fires, leaves the check green and the drift shipping. The reflow case is a
# regression — Prettier rewraps prose, so a phrase is routinely split across two lines.

REPO_ROOT=$(cd -- "$HOOKS_DIR/../.." && pwd)
CHECK_DOCS="$REPO_ROOT/check-docs.mjs"

docs_fixture() {
  local dir="$SANDBOX/docs-$1"
  mkdir -p "$dir/.claude/config"
  git init -q "$dir"
  # The banned patterns come from the real manifest, so a typo there fails these cases
  # rather than passing a copy of itself.
  node -e 'const real=JSON.parse(require("fs").readFileSync(process.argv[1]));
    require("fs").writeFileSync(process.argv[2], JSON.stringify({
      owned: [{ phrase: "top-level operations only", owner: "owner.md" }],
      banned: real.banned,
      githubRelativeLinks: [],
    }))' "$REPO_ROOT/.claude/config/docs-ownership.json" "$dir/.claude/config/docs-ownership.json"
  printf '%s' "$dir"
}

run_check_docs() {
  local dir="$1"
  [ "${SKIP_ADD-}" = 1 ] || git -C "$dir" add -A >/dev/null 2>&1
  DOCS_OUT=$(cd "$dir" && node "$CHECK_DOCS" 2>&1)
  DOCS_EXIT=$?
}

expect_docs_ok() {
  run_check_docs "$1"
  if [ "$DOCS_EXIT" -eq 0 ]; then pass "$2"; else fail "$2" "expected 0, got $DOCS_EXIT: $DOCS_OUT"; fi
}

expect_docs_fail() {
  local dir="$1" name="$2" needle="$3"
  run_check_docs "$dir"
  if [ "$DOCS_EXIT" -eq 0 ]; then
    fail "$name" "expected a failure, got a clean run"
  elif ! printf '%s' "$DOCS_OUT" | grep -q -- "$needle"; then
    fail "$name" "failed for the wrong reason: $DOCS_OUT"
  else
    pass "$name"
  fi
}

D=$(docs_fixture clean)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
expect_docs_ok "$D" 'a fact stated once, in its owner, is clean'

D=$(docs_fixture second-home)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Remember it covers top-level operations only.\n' > "$D/other.md"
expect_docs_fail "$D" 'the same fact in a second document is drift' 'owned by owner.md'

D=$(docs_fixture reflowed)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'It covers top-level\noperations only, so nested writes differ.\n' > "$D/other.md"
expect_docs_fail "$D" 'a phrase Prettier split across two lines is still found' 'owned by owner.md'

D=$(docs_fixture orphaned)
printf 'Nothing here states it any more.\n' > "$D/owner.md"
expect_docs_fail "$D" 'an owner that stopped stating its fact is reported' 'no longer states it'

D=$(docs_fixture dead-link)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'See [the rule](nowhere.md).\n' > "$D/other.md"
expect_docs_fail "$D" 'a relative link with no target fails' 'link target does not exist'

D=$(docs_fixture live-link)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'See [the rule](owner.md) and [the site](https://example.com).\n' > "$D/other.md"
expect_docs_ok "$D" 'a link that resolves, and an external URL, both pass'

D=$(docs_fixture capitalised)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Top-level operations only, is the rule.\n' > "$D/other.md"
expect_docs_fail "$D" 'an owned phrase is caught whatever its capitalisation' 'owned by owner.md'

D=$(docs_fixture allowlisted-link)
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.githubRelativeLinks=["../../security/advisories/new"];require("fs").writeFileSync(f,JSON.stringify(m))' \
  "$D/.claude/config/docs-ownership.json"
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Report it [privately](../../security/advisories/new).\n' > "$D/other.md"
expect_docs_ok "$D" 'a link the manifest allowlists is not resolved on disk'

D=$(docs_fixture fenced)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Example:\n\n```md\n[x](made-up.md)\n```\n' > "$D/other.md"
expect_docs_ok "$D" 'a link inside a fenced block is an example, not a link'

D=$(docs_fixture war-story)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'This was closed by PR #40.\n' > "$D/other.md"
expect_docs_fail "$D" 'a war story is refused' 'a war story'

# One case per banned pattern: a typo in any of them would otherwise leave the gate green.
D=$(docs_fixture measurement)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Measured on node v26, the answer is 2.\n' > "$D/other.md"
expect_docs_fail "$D" 'a measurement is refused' 'not the measurement'

D=$(docs_fixture transcript)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Verified by removing both dist directories.\n' > "$D/other.md"
expect_docs_fail "$D" 'a reproduction transcript is refused' 'goes stale'

D=$(docs_fixture dated)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Checked 18 Aug 2026 against the release.\n' > "$D/other.md"
expect_docs_fail "$D" 'a dated observation is refused' 'next release'

D=$(docs_fixture missing-owner)
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.owned=[{phrase:"ghost",owner:"gone.md"}];require("fs").writeFileSync(f,JSON.stringify(m))' \
  "$D/.claude/config/docs-ownership.json"
printf 'nothing here\n' > "$D/other.md"
expect_docs_fail "$D" 'a manifest owner that does not exist is reported' 'does not exist'

D=$(docs_fixture vanished)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'gone soon\n' > "$D/other.md"
git -C "$D" add -A >/dev/null 2>&1
rm "$D/other.md"
SKIP_ADD=1 expect_docs_fail "$D" 'a tracked file missing from the tree is a message, not a stack' 'missing from the working tree'

D=$(docs_fixture dead-anchor)
printf 'It sees top-level operations only.\n\n## Real heading\n' > "$D/owner.md"
printf 'See [it](owner.md#no-such-heading).\n' > "$D/other.md"
expect_docs_fail "$D" 'a link to a heading that does not exist fails' 'no heading'

# The two fixes that had no case of their own: fences are blanked for every check, not just
# links, and the config JSON is part of the corpus. Reverting either must turn this red.
D=$(docs_fixture fenced-phrase)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Example:\n\n```md\nIt sees top-level operations only, per PR #40.\n```\n' > "$D/other.md"
expect_docs_ok "$D" 'an owned phrase and a war story inside a fence are examples, not drift'

D=$(docs_fixture config-json)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf '{ "why": "the extension sees top-level operations only" }\n' \
  > "$D/.claude/config/external-docs.json"
expect_docs_fail "$D" 'prose in .claude/config JSON is part of the corpus' 'owned by owner.md'

# GitHub replaces each space, so punctuation between words leaves a double hyphen.
D=$(docs_fixture anchor-slug)
printf 'It sees top-level operations only.\n\n## Step 1 / Enter the loop\n' > "$D/owner.md"
printf 'See [it](owner.md#step-1--enter-the-loop).\n' > "$D/other.md"
expect_docs_ok "$D" 'an anchor slugged the way GitHub slugs it resolves'

D=$(docs_fixture em-dash)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'The gate runs first \xe2\x80\x94 then the tests.\n' > "$D/other.md"
expect_docs_fail "$D" 'an em dash in prose is refused' 'AI tell'

D=$(docs_fixture em-dash-literal)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'The note format is `\xe2\x80\x94 done <date>`.\n' > "$D/other.md"
expect_docs_ok "$D" 'a dash inside a backticked literal is quoted, not written'

D=$(docs_fixture managed-block)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf '<!-- BEGIN:vendor -->\nA tool wrote this \xe2\x80\x94 we did not.\n<!-- END:vendor -->\n' > "$D/other.md"
expect_docs_ok "$D" 'a block a dependency maintains is not ours to fix'

D=$(docs_fixture vocabulary)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'We utilize, leverage and facilitate numerous delve showcase testament underscore.\n' > "$D/other.md"
expect_docs_fail "$D" 'a fancy word where a plain one is clearer is refused' 'plain word'

D=$(docs_fixture curly)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'The \xe2\x80\x9cclient\xe2\x80\x9d\xe2\x80\x99s \xe2\x80\x98token\xe2\x80\x99 is verified.\n' > "$D/other.md"
expect_docs_fail "$D" 'a curly quote is refused' 'straight ones'

D=$(docs_fixture filler)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Run it in order to rebuild, due to the fact that it is important to note that.\n' > "$D/other.md"
expect_docs_fail "$D" 'a filler phrase is refused' 'cut it'

D=$(docs_fixture not-only)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'It gives not only types, but options, and not just zod, but keys.\n' > "$D/other.md"
expect_docs_fail "$D" 'the not-only frame is refused' 'directly'

D=$(docs_fixture serves-as)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'The guard serves as, stands as and boasts the only entry point.\n' > "$D/other.md"
expect_docs_fail "$D" 'a fancy way to say is or has is refused' 'is or has'

# A marker quoted in prose must not open a blanked region: the fail-open direction is the
# one that reports "no drift" over arbitrary text.
D=$(docs_fixture quoted-marker)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf 'Write `<!-- BEGIN:x -->` to open one.\n\nThis restates top-level operations only.\n\n<!-- BEGIN:v -->\nvendor\n<!-- END:v -->\n' > "$D/other.md"
expect_docs_fail "$D" 'a marker quoted in prose does not blank the rest of the file' 'owned by owner.md'

D=$(docs_fixture unmatched-marker)
printf 'It sees top-level operations only.\n' > "$D/owner.md"
printf '<!-- BEGIN:a -->\nvendor a\n\nOur prose restates top-level operations only.\n\n<!-- BEGIN:v -->\nvendor v\n<!-- END:v -->\n' > "$D/other.md"
expect_docs_fail "$D" 'an unclosed marker does not reach another block END' 'owned by owner.md'

D=$(docs_fixture fenced-heading)
printf 'It sees top-level operations only.\n\n```bash\n# Not a heading\n```\n' > "$D/owner.md"
printf 'See [it](owner.md#not-a-heading).\n' > "$D/other.md"
expect_docs_fail "$D" 'a # inside a fence is not a heading' 'no heading'

D=$(docs_fixture live-anchor)
printf 'It sees top-level operations only.\n\n## Real heading\n' > "$D/owner.md"
printf 'See [it](owner.md#real-heading).\n' > "$D/other.md"
expect_docs_ok "$D" 'a link to a heading that exists passes'


echo
if [ "$FAILED" -gt 0 ]; then
  printf '%d passed, %d FAILED\n' "$PASSED" "$FAILED" >&2
  exit 1
fi
printf '%d passed\n' "$PASSED"
