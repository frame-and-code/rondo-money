#!/usr/bin/env bash
# PreToolUse :: Bash — refuse commands that break a project rule.
#
# Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
# Input: the PreToolUse JSON on stdin; the command is .tool_input.command.
#
# Node does the JSON parsing: it is already a hard requirement of this repo (see the
# README), so the guard adds no new prerequisite. If it is missing we block rather than
# wave everything through — a guard that fails open is not a guard.
#
# Scope, stated honestly: this refuses an agent's own shortcuts, it is not a sandbox. A
# determined bypass stays possible — a script file, an encoded string, a renamed binary, a
# command handed to another interpreter (`bash -c "…"`, `ssh host "…"`), an escaped quote
# crafted to unbalance the pass below — and chasing each one would only grow a brittle
# pattern list. What it buys is that the obvious ways round a rule fail loudly, which is
# where the accidents actually happen.
#
# Everything below matches a *normalised* copy of the command; which normalisation depends on
# what the check needs to see, and each of the four is derived once, near the top. Each step
# exists because a
# spelling got through without it, and every one of them is pinned in hooks.test.sh — the
# shape of the bypass is always the same, a command that means one thing to bash and reads as
# another to a pattern.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

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

# A backslash before a newline is one command written across two lines. Join them first:
# anything that later splits on newlines would otherwise read the continuation as a separate
# command, and the first line's words as that command's arguments.
JOINED=${COMMAND//\\$'\n'/ }

# `$(…)` and backticks nest a command inside another. The opener becomes a **separator**, not
# whitespace: every check below anchors either on the start of a segment or on `;&|(`, so
# replacing it with a space would leave the inner command wearing the outer one's first word
# — `echo $(npm install)` reads as one command called `echo` and matches nothing.
NESTED=$(printf '%s' "$JOINED" | sed -E 's/\$\(/ ; /g; s/`/ ; /g')

# `eval` runs the string it is handed, so the quotes around that string belong to eval, not
# to the command inside it. Unwrap them before anything quote-aware runs: otherwise
# `eval 'git commit -n -m x'` blanks to `''` for the secret-scan checks while bash runs the
# commit with the hook disabled.
UNEVAL=$(printf '%s' "$NESTED" | sed -E "s/(^|[;&|(][[:space:]]*)eval[[:space:]]+\"([^\"]*)\"/\1\2/g")
UNEVAL=$(printf '%s' "$UNEVAL" | sed -E "s/(^|[;&|(][[:space:]]*)eval[[:space:]]+'([^']*)'/\1\2/g")

# A prefix match sees only the first word, so wrappers and inline assignments would hide the
# real command: `command npm i`, `env FOO=1 npm i`, `sudo npm i`, `nohup git push`,
# `timeout 60 git push`. Peel them off — three passes cover the nestings worth worrying
# about. The HUSKY=0 check below deliberately reads the original command, since peeling
# removes the very assignment it looks for.
NAKED="$UNEVAL"
PEEL="s/(^|[;&|(][[:space:]]*)((command|exec|eval|env|sudo|time|nice|nohup|xargs)[[:space:]]+|(timeout[[:space:]]+[0-9]+[smhd]?|stdbuf([[:space:]]+-[^[:space:]]+)*|pnpm[[:space:]]+exec)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=(\"[^\"]*\"|'[^']*'|[^[:space:]]*)[[:space:]]+)/\1/g"
for _ in 1 2 3; do
  NAKED=$(printf '%s' "$NAKED" | sed -E "$PEEL")
done

# git's own global options push the verb away from `git`: `git -C repo push`,
# `git --no-pager push`. Collapse them so the verb sits next to `git`.
COLLAPSED="$NAKED"
for _ in 1 2 3; do
  COLLAPSED=$(printf '%s' "$COLLAPSED" | sed -E 's/(^|[;&|([:space:]])git[[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|--(git-dir|work-tree|namespace|exec-path)[[:space:]]*=[^[:space:]]+|-[a-zA-Z-]+)[[:space:]]+/\1git /g')
done

# Grouping punctuation belongs to the shell, not to the command: bash removes it before git
# sees any of it. Both families of check start from a copy without it, so `(git commit …)` and
# `{ git push …; }` are the commands they are — an asymmetry here once let a grouped commit
# past the secret-scan checks while a grouped push was refused.
GROUPED=$(printf '%s' "$COLLAPSED" | tr -d '(){}')

# From there the two families need opposite things from quotes.
#
# BLANKED empties what is inside them, so a commit message can neither hide a flag
# (`git commit -m "wip" -n` — the flag is outside the quotes and must be seen) nor invent one
# (`git commit -m "use grep -n"` — inside, and must not be).
BLANKED=$(printf '%s' "$GROUPED" | sed -E 's/"[^"]*"/""/g')
BLANKED=$(printf '%s' "$BLANKED" | sed -E "s/'[^']*'/''/g")

# UNQUOTED keeps the contents and drops the quotes themselves, so `git push origin "main"`
# names the destination the unquoted form names — a guard that compares before the shell has
# stripped them is reading a different command than the one that runs. The cost is a commit
# message that itself contains `; git push origin main`, which is refused: the safe direction
# of the two.
UNQUOTED=$(printf '%s' "$GROUPED" | tr -d "\"'")

# One segment per command. Splitting matters because a guard that reasons over the whole
# string reads one command's words as another's: a push on a second line took the first
# line's words as its refspecs, a greedy match saw only the last push of a chain so the
# verdict depended on argument order, and words inside a quoted argument were counted as the
# refspecs of a push that does not exist. `tr` does the splitting because `\n` in a sed
# replacement is a GNU extension and this repository is developed on macOS.
segments_of() {
  printf '%s' "$1" | tr ';&|\n' '\n\n\n\n'
}

# The push checks read UNQUOTED, which keeps what is inside quotes, so they must anchor on the
# start of a segment — otherwise `gh pr comment --body "rerun git push origin"` reads as a
# push. The keywords that can precede a command inside a compound statement repeat, because
# `while ! git push …` is two of them and is a retry idiom rather than an evasion.
GIT_PUSH='^[[:space:]]*((!|if|then|else|elif|while|until|do)[[:space:]]+)*git[[:space:]]+push([[:space:]]|$)'

# The secret-scan checks read BLANKED, where quoted text is already emptied — so they can
# match the invocation anywhere in the segment without that false positive, and one
# unrecognised word before `git` no longer switches them off. That anchor was a strict
# weakening: `eval`, `stdbuf -o0`, `if ! git commit …` and `GIT_EDITOR="code -w" git commit …`
# all skipped the scan while the version this replaced refused them.
ANY_COMMIT='(^|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'
ANY_PUSH='(^|[[:space:]])git[[:space:]]+push([[:space:]]|$)'

# This project is pnpm-only: a stray npm/yarn install rewrites the lockfile. Reads the
# quote-blanked copy like the checks below, so that grepping the repository's own prose about
# npm — `grep -n "hooksPath\|npm after" …`, where the `\|` lands on the separator class — is
# not refused as an install.
if printf '%s' "$BLANKED" | grep -qE '(^[[:space:]]*|[;&|(][[:space:]]*)(npm|yarn)[[:space:]]'; then
  echo "BLOCKED: this project uses pnpm. Use pnpm instead of npm/yarn." >&2
  exit 2
fi

# The pre-commit hook is the secret scan (ADR-003: publishing exposes the whole history).
# Skipping it is never the fix for a gitleaks hit.
#
# Both spellings must belong to the git invocation rather than merely appear in the line:
# testing "is the flag present" and "is git commit present" as independent conditions
# refused `grep -n "git push" README.md` and blamed a secret that does not exist. And `-n` is
# --no-verify only on `git commit`; on `git push` the same letter means --dry-run.
if segments_of "$BLANKED" | grep -E "$ANY_PUSH|$ANY_COMMIT" | grep -q -- '--no-verify'; then
  echo "BLOCKED: --no-verify skips the gitleaks pre-commit scan. Remove the secret instead." >&2
  exit 2
fi

# `-n` bundles with git's other short flags, and the bundle skips the hook just as well:
# `git commit -nm "wip"` was demonstrated committing with the pre-commit hook never running.
if segments_of "$BLANKED" | grep -E "$ANY_COMMIT" | grep -qE '[[:space:]]-[a-zA-Z]*n[a-zA-Z]*([[:space:]]|$)'; then
  echo "BLOCKED: git commit -n skips the gitleaks pre-commit scan. Remove the secret instead." >&2
  exit 2
fi

# These two read the command as typed apart from its quotes — peeling would remove the very
# assignment the first one looks for, and collapsing the very `-c` the second does. Every quote
# comes off, because bash removes them all before the program sees anything: `HUSKY="0"`,
# `env "HUSKY=0"` and `git -c "core.hooksPath=/dev/null"` reach husky and git exactly as their
# unquoted twins do.
#
# What separates a setting from a search is therefore **position**, not quoting: an assignment
# sits at the head of a command, and a `git` option belongs to a `git` invocation, while
# `grep -rn "HUSKY=0" .` names the same text as an argument to something else. Deciding by
# quotes instead was tried and was wrong in both directions at once — it refused the search and
# allowed the wholly quoted setting.
BARE=$(printf '%s' "$COMMAND" | tr -d "\"'")
ASSIGN_POS='^[[:space:]]*((command|exec|eval|env|sudo|time|nice|nohup|xargs)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
GIT_ANY='^[[:space:]]*((!|if|then|else|elif|while|until|do)[[:space:]]+)*git([[:space:]]|$)'

if segments_of "$BARE" | grep -qE "${ASSIGN_POS}HUSKY=0([[:space:]]|$)"; then
  echo "BLOCKED: HUSKY=0 disables the git hooks, including the secret scan." >&2
  exit 2
fi

# `git -c core.hooksPath=/dev/null commit` points git at an empty hook directory: the same
# effect as --no-verify, by a different door. `git config core.hooksPath /dev/null` is the
# same door left open — it persists in the repository's config rather than lasting one command.
if segments_of "$BARE" | grep -E "$GIT_ANY" | grep -qE 'core\.hooksPath([[:space:]]*=|[[:space:]]+[^-])'; then
  echo "BLOCKED: overriding core.hooksPath disables the git hooks, including the secret scan." >&2
  exit 2
fi

# main is protected by a branch ruleset; fail here rather than at the remote. Matching the
# word "main" anywhere is not enough, because the ways to name it barely look alike:
# `main:refs/heads/main`, `refs/heads/main`, `+main` (a force push, which `--force` in the
# deny list never sees), `"main"`, `HEAD` and `@` (whatever is checked out), a wildcard
# refspec, and no refspec at all — which pushes the current branch.
while IFS= read -r SEGMENT; do
  printf '%s' "$SEGMENT" | grep -qE "$GIT_PUSH" || continue

  ARGS=${SEGMENT#*push}
  # These write to no remote at all. On `git push`, `-n` is --dry-run, not --no-verify — the
  # opposite of what the same letter means on `git commit`.
  printf '%s' "$ARGS" | grep -qE '(^|[[:space:]])(--help|--dry-run|-n)([[:space:]]|$)' && continue

  # No globbing while splitting into tokens: unquoted `$ARGS` is otherwise expanded against
  # the hook's working directory, and `git push *` would be judged by how many files happen
  # to sit there — as well as losing the literal `*` a wildcard refspec is recognised by.
  set -f
  REFSPECS=0
  SKIP_VALUE=0
  TAGS_ONLY=0
  for TOKEN in $ARGS; do
    if [ "$SKIP_VALUE" -eq 1 ]; then
      SKIP_VALUE=0
      continue
    fi
    case "$TOKEN" in
      # `git push origin --tags` publishes refs/tags and no branch, so the no-refspec fallback
      # below must not read it as a push of whatever is checked out.
      --tags)
        TAGS_ONLY=1
        continue
        ;;
      --all | --mirror)
        echo "BLOCKED: --all/--mirror pushes every branch, main included. Name the branch instead." >&2
        exit 2
        ;;
      # These take their value as a separate word. Counting that word as a refspec is how
      # `git push -o ci.skip origin` stopped looking like a push with no refspec at all.
      -o | --push-option | --exec | --receive-pack | --repo | --recurse-submodules)
        SKIP_VALUE=1
        continue
        ;;
      -*) continue ;;
    esac
    REFSPECS=$((REFSPECS + 1))
    # In `src:dst` the destination is what gets written; a bare `main` is its own destination.
    # A leading `+` forces the push — the most destructive spelling, and the one that hides
    # from `--force` in the deny list.
    DEST=${TOKEN##*:}
    DEST=${DEST#+}
    DEST=${DEST#refs/heads/}
    case "$DEST" in
      # `refs/heads/*:refs/heads/*` publishes every branch, main among them.
      *'*'*)
        echo "BLOCKED: a wildcard refspec pushes every branch it matches, main included." >&2
        exit 2
        ;;
      # `HEAD` and `@` name whatever is checked out, so `git push origin HEAD` is
      # `git push origin main` with fewer keystrokes — and it is the form reached for exactly
      # when the branch name was not worth typing.
      HEAD | @) DEST=$(git -C "$PROJECT_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null) ;;
    esac
    case "$DEST" in
      main | master)
        echo "BLOCKED: main takes changes through a PR only. Push the feature branch instead." >&2
        exit 2
        ;;
    esac
  done
  set +f

  # The first non-option token is the remote, so one or none of them means no refspec was
  # named — and git then publishes the current branch. That is the accidental way onto main,
  # and the likelier one: the refspec forms above all take a deliberate keystroke.
  if [ "$REFSPECS" -le 1 ] && [ "$TAGS_ONLY" -eq 0 ]; then
    case "$(git -C "$PROJECT_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null)" in
      main | master)
        echo "BLOCKED: this pushes the current branch, and it is main. Changes reach main through a PR." >&2
        exit 2
        ;;
    esac
  fi
done <<EOF
$(segments_of "$UNQUOTED")
EOF

# --no-preserve-root exists only to make `rm -rf /` work. There is no benign use here.
if printf '%s' "$NAKED" | grep -qE 'rm[[:space:]].*--no-preserve-root'; then
  echo "BLOCKED: rm --no-preserve-root. Name the exact path to remove." >&2
  exit 2
fi

# Recursive delete aimed at a root, a home, a parent or a bare glob.
if printf '%s' "$NAKED" | grep -qiE 'rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\s+(/\s|/\s*$|\.\.|~|/Users|\.\s*$|\*)'; then
  echo "BLOCKED: dangerous recursive delete. Name the exact path to remove." >&2
  exit 2
fi

exit 0
