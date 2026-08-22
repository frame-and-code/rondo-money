#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v op >/dev/null 2>&1; then
  echo "ERROR: 1Password CLI (op) not found. Install it with: brew install 1password-cli," >&2
  echo "then enable Settings → Developer → Integrate with 1Password CLI in the 1Password app." >&2
  exit 1
fi

cp .env.example .env
echo "✓ .env ← .env.example"

for app in web api; do
  op inject --force -i "apps/${app}/.env.local.tpl" -o "apps/${app}/.env.local" >/dev/null
  chmod 600 "apps/${app}/.env.local"
  echo "✓ apps/${app}/.env.local ← apps/${app}/.env.local.tpl"
done

echo "Done. Env files generated (git ignores them)."
