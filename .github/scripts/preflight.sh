#!/usr/bin/env bash
# Decides which secret-dependent jobs this CI run can take, and fails the run when a secret is
# missing where it has to be present. The gate counts a skipped job as passing, so a skip is
# allowed only where GitHub withholds the secret by design; anywhere else it is a broken
# configuration, and staying green would hide it. docs/ci.md says which runs are which.
#
# Inputs are booleans the workflow computes, never a secret's value:
#   HAS_CLERK_KEYS  the three Clerk keys the e2e job needs are readable
#   HAS_SONAR_TOKEN SONAR_TOKEN is readable
#   IS_FORK         the pull request comes from a fork (empty on a push)
#   IS_DEPENDABOT   Dependabot triggered the run, which reads only its own secret store

set -uo pipefail

has_clerk_keys="${HAS_CLERK_KEYS:-false}"
has_sonar_token="${HAS_SONAR_TOKEN:-false}"
is_fork="${IS_FORK:-false}"
is_dependabot="${IS_DEPENDABOT:-false}"

refusals=0

refuse() {
  printf '::error::%s\n' "$1"
  refusals=$((refusals + 1))
}

summarise() {
  printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"
}

if [ "$has_clerk_keys" != 'true' ]; then
  if [ "$is_fork" = 'true' ] || [ "$is_dependabot" = 'true' ]; then
    summarise '### E2E will be skipped' '' \
      'GitHub does not expose the Clerk keys to a fork pull request or to a Dependabot run, and e2e cannot sign in without them. Every other job still runs. See docs/ci.md.'
  else
    refuse 'The Clerk keys are not readable from this run, which is neither a fork pull request nor a Dependabot run, so e2e would be skipped without anyone noticing. Check CLERK_SECRET_KEY, CLERK_JWT_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in the repository Actions secrets.'
  fi
fi

if [ "$has_sonar_token" != 'true' ]; then
  if [ "$is_fork" = 'true' ]; then
    summarise '### Sonar analysis will be skipped' '' \
      'GitHub does not expose SONAR_TOKEN to a fork pull request. Every other job still runs. See docs/ci.md.'
  else
    refuse 'SONAR_TOKEN is not readable from this run, which is not a fork pull request, so the Sonar quality gate would be skipped without anyone noticing. Check the secret in both the Actions and the Dependabot secret stores.'
  fi
fi

printf 'has_clerk_keys=%s\n' "$has_clerk_keys" >>"$GITHUB_OUTPUT"
printf 'has_sonar_token=%s\n' "$has_sonar_token" >>"$GITHUB_OUTPUT"

[ "$refusals" -eq 0 ]
