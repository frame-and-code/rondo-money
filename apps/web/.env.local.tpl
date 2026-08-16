# The env contract of @rondo/web (single source — there is no separate .env.example).
# Generate apps/web/.env.local from it with `pnpm env:setup` (setup-env.sh at the repo
# root, needs the 1Password CLI); without 1Password, copy this file to .env.local and
# replace the 1Password secret references by hand. (`op inject` parses references
# anywhere in the file, comments included — that's why this line avoids spelling one.)
#
# Secrets live in a single 1Password item: vault "rondo-money", item "local", field name =
# variable name, field value = the secret. Create the fields once (the keys are at
# dashboard.clerk.com → API Keys of the dev instance):
#   op item edit local --vault rondo-money \
#     'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY[text]=pk_test_...' \
#     'CLERK_SECRET_KEY[concealed]=sk_test_...'

# Base URL of the @rondo/api backend. Exposed to the browser, so it must be NEXT_PUBLIC_*.
# Locally the API runs on :3000 (see apps/api); on Railway point this at the deployed API.
NEXT_PUBLIC_API_URL="http://localhost:3000"

# Clerk keys (F1.1). The publishable key is inlined into the browser bundle
# (NEXT_PUBLIC_*); the secret key is server-only (clerkMiddleware in src/proxy.ts) and
# must never get a NEXT_PUBLIC_ prefix. New variables must also be declared in turbo.json
# (strict env mode) and, when build-time, in apps/web/Dockerfile (build arg).
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="{{ op://rondo-money/local/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}"
CLERK_SECRET_KEY="{{ op://rondo-money/local/CLERK_SECRET_KEY }}"
