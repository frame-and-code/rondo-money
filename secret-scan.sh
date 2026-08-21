#!/usr/bin/env sh
set -e

mode="${1:-staged}"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secret-scan: gitleaks not found on PATH, so nothing can be scanned." >&2
  echo "secret-scan: install it (\`brew install gitleaks\`) — see README → Requirements." >&2
  echo "secret-scan: already installed? A git GUI launched from the Dock inherits a PATH" >&2
  echo "secret-scan: without /opt/homebrew/bin — commit from a terminal, or extend PATH in" >&2
  echo "secret-scan: ~/.config/husky/init.sh." >&2
  exit 1
fi

case "${mode}" in
  staged)
    exec gitleaks git --pre-commit --staged --redact --no-banner
    ;;
  history)
    exec gitleaks git . --redact --no-banner --verbose
    ;;
  *)
    echo "usage: ${0} [staged|history]" >&2
    exit 2
    ;;
esac
