#!/usr/bin/env bash
# Prepares all local env files (`pnpm env:setup`), so a new machine needs nothing beyond
# 1Password and this script — no copying values by hand:
#   - .env (repo root) holds no secrets — a straight copy of the committed .env.example;
#   - apps/web/.env.local and apps/api/.env.local carry Clerk secrets — injected from the
#     op:// references in the matching .env.local.tpl via the 1Password CLI.
#
# One-time machine setup:
#   brew install 1password-cli
#   1Password (desktop) → Settings → Developer → Integrate with 1Password CLI
# One-time secrets setup (the item the templates read from):
#   see the comment in apps/web/.env.local.tpl
#
# `op inject` triggers the 1Password authorization prompt (biometrics) on first use.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v op >/dev/null 2>&1; then
  echo "ERROR: 1Password CLI (op) not found. Install it with: brew install 1password-cli," >&2
  echo "then enable Settings → Developer → Integrate with 1Password CLI in the 1Password app." >&2
  exit 1
fi

cp .env.example .env
echo "✓ .env ← .env.example"

# --force overwrites the existing file — this script is the source of truth for env files.
for app in web api; do
  op inject --force -i "apps/${app}/.env.local.tpl" -o "apps/${app}/.env.local" >/dev/null
  chmod 600 "apps/${app}/.env.local"
  echo "✓ apps/${app}/.env.local ← apps/${app}/.env.local.tpl"
done

echo "Done. Env files generated (git ignores them)."
