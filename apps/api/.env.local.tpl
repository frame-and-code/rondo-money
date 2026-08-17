# The secrets @rondo/api needs locally. Everything non-secret it reads (DATABASE_URL,
# WEB_ORIGIN) lives in the workspace-root .env — see .env.example; the api loads
# .env.local first, then that file (src/app.module.ts).
#
# Generate apps/api/.env.local from this template with `pnpm env:setup` (setup-env.sh at
# the repo root, needs the 1Password CLI); without 1Password, copy this file to .env.local
# and replace the 1Password secret references by hand. (`op inject` parses references
# anywhere in the file, comments included — that's why this line avoids spelling one.)
#
# Secrets live in a single 1Password item: vault "rondo-money", item "local", field name =
# variable name. CLERK_SECRET_KEY is the same field @rondo/web reads — one Clerk dev
# instance, one key — so apps/web/.env.local.tpl already created it.

# Clerk (F1.2). The guard verifies every session token itself; the secret key is what it
# resolves the instance's JWKS with. Server-only — this file is git-ignored and must never
# grow a NEXT_PUBLIC_ variable.
CLERK_SECRET_KEY="{{ op://rondo-money/local/CLERK_SECRET_KEY }}"

# Optional alternative to the above: the instance's PEM public key (Clerk Dashboard → API
# keys → Show JWT public key). When set it wins, and tokens are verified without any call
# to Clerk. Left unset locally — the secret key is one variable instead of a pasted PEM.
# CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
