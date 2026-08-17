# What @rondo/api reads locally beyond the workspace-root .env (DATABASE_URL, WEB_ORIGIN —
# see .env.example). The api loads .env.local first, then that file (src/app.module.ts).
#
# Generate apps/api/.env.local from this template with `pnpm env:setup` (setup-env.sh at
# the repo root, needs the 1Password CLI); without 1Password, copy this file to .env.local
# and fill the value in by hand. (`op inject` parses references anywhere in the file,
# comments included — that's why this line avoids spelling one.)
#
# Values live in a single 1Password item: vault "rondo-money", item "local", field name =
# variable name. Create this one once, from the Clerk Dashboard → API Keys → JWKS Public
# Key, pasted exactly as copied:
#   op item edit local --vault rondo-money 'CLERK_JWT_KEY[text]=<paste the PEM>'

# Clerk (F1.2). The instance's **public** key: the guard checks every session token's
# signature against it, locally, with no call to Clerk. Not a secret — Clerk publishes the
# same key at its JWKS URL — but it stays out of git because it would pin this repository
# to one Clerk instance.
#
# The alternative the code accepts, CLERK_SECRET_KEY, is deliberately not used here: it is
# an admin credential for Clerk's Backend API, and it would make verification fetch the
# JWKS over the network. Running the same key everywhere also keeps the startup warning
# about that path meaningful — a warning seen every day is a warning nobody reads.
CLERK_JWT_KEY="{{ op://rondo-money/local/CLERK_JWT_KEY }}"
