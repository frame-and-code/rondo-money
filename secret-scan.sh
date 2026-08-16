#!/usr/bin/env sh
# Secret scan — the single definition of how this repository is scanned for secrets, used
# by both callers so they cannot drift apart:
#
#   staged   .husky/pre-commit, on every commit — local, fast, bypassable feedback
#   history  the `secrets` job of the CI gate (.github/workflows/ci.yml) — the copy that
#            cannot be walked around with --no-verify
#
# The two modes differ only in what they read: the same binary, the same flags, one place to
# change them. Run `pnpm scan:secrets` to scan the full history by hand.
#
# Why it exists at all: the repository is public (ADR-003), so a secret that reaches a commit
# is a secret that reaches every clone, and rewriting history does not un-download it.
set -e

mode="${1:-staged}"

# gitleaks is a binary rather than an npm dependency, so unlike everything else in the hook
# it can simply be absent. Missing means the commit is refused rather than scanned-and-passed:
# a check that silently skips itself still reads as protection, which is worse than no check.
# Not pinned locally (CI pins its own copy) — developed against 8.30.1.
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secret-scan: gitleaks not found on PATH, so nothing can be scanned." >&2
  echo "secret-scan: install it (\`brew install gitleaks\`) — see README → Requirements." >&2
  echo "secret-scan: already installed? A git GUI launched from the Dock inherits a PATH" >&2
  echo "secret-scan: without /opt/homebrew/bin — commit from a terminal, or extend PATH in" >&2
  echo "secret-scan: ~/.config/husky/init.sh." >&2
  exit 1
fi

case "${mode}" in
  # --staged reads what is about to be committed and --pre-commit treats it as a diff, so the
  # cost stays flat as history grows.
  staged)
    exec gitleaks git --pre-commit --staged --redact --no-banner
    ;;
  # The whole history, because a rebase or a force push can carry an old secret into a new
  # commit range where a diff-only scan sees nothing. --redact matters most here: CI logs of
  # a public repository are public, and an unredacted finding would publish the very secret
  # the scan just caught.
  history)
    exec gitleaks git . --redact --no-banner --verbose
    ;;
  *)
    echo "usage: ${0} [staged|history]" >&2
    exit 2
    ;;
esac
