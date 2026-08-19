#!/usr/bin/env sh
# Contract regeneration — the single definition of how the API contract and its typed client
# are produced (F1.4), used by both callers so they cannot drift apart:
#
#   stage  .husky/pre-commit, on every commit — regenerates and stages the result, so a
#          contract change and its client land in the same commit without anyone remembering
#   check  the `static` job of the CI gate (.github/workflows/ci.yml) — the copy that cannot
#          be walked around with --no-verify: a stale artefact fails the build
#
# Both modes run the same two commands; only what happens to the result differs.
set -e

mode="${1:-check}"

# Validated before anything is generated, deliberately: a typo used to rewrite both committed
# artefacts and only then print this usage.
case "${mode}" in
  stage | check) ;;
  *)
    echo "usage: ${0} [stage|check]" >&2
    exit 2
    ;;
esac

# Both artefacts are committed (F1.4), so a contract change is a reviewable diff — and both
# can go stale independently: the spec drifts from the NestJS code, the client drifts from the
# spec. The list lives here once, so adding a third generated artefact updates both callers.
# `${artefacts}` and `${sources}` are unquoted where they are used: they are lists of paths,
# and word splitting is how git receives them as several arguments rather than one.
artefacts='apps/api/openapi.json packages/api-client/src/generated'

# The *source code* the two artefacts are generated from — what the `stage` guard below asks
# about. The spec comes out of apps/api/src (response classes and the decorators on them) and
# packages/types, the only other workspace whose shapes can reach a response body. The client
# comes out of the spec *and* openapi-ts.config.ts, whose plugin list decides which files
# src/generated contains at all — a guard watching only the spec's inputs would miss it.
#
# Not the whole input, deliberately: the output also depends on the *versions* of @nestjs/swagger
# and @hey-api/openapi-ts, and those are settled by pnpm-lock.yaml rather than by any manifest
# range. Watching the lockfile would fire on every unrelated install, so a generator bump is
# left to the drift check in CI — which is where it shows up anyway, since Dependabot commits
# the manifest and the lockfile together.
sources='apps/api/src packages/types/src packages/api-client/openapi-ts.config.ts'

# `pnpm openapi` builds the api and boots it in Nest's preview mode: no server, no database,
# no DATABASE_URL — it works on a clean clone. Then the client is generated from that file.
pnpm openapi
pnpm --filter @rondo/api-client codegen

case "${mode}" in
  stage)
    # Does this commit carry a contract change at all? `git status` answers for both places it
    # can live: its two columns are index-vs-HEAD and worktree-vs-index, so this covers both
    # "regenerating just moved the artefacts" and "they were staged by hand before the hook
    # ran". Gating the guard on the narrower first case alone would let the second one through.
    touched="$(git status --porcelain -- ${artefacts})"

    # The generator reads the working tree; the commit is built from the index. Where the two
    # differ under the sources above, the contract heading into this commit is not the one the
    # commit's own sources produce — and CI, which sees only the commit, would fail the drift
    # check this hook exists to prevent. So refuse instead, and say what to stage.
    #
    # The two halves are kept apart because the way out of them differs: `git stash` moves a
    # modified file aside but leaves an untracked one exactly where it is, so pointing at a
    # bare `git stash` here would hand back the same refusal on the next attempt. `git diff`
    # alone would not even see the untracked half — and a whole new controller is the change
    # that moves the contract most.
    if [ -n "${touched}" ]; then
      modified="$(git diff --name-only -- ${sources})"
      untracked="$(git ls-files --others --exclude-standard -- ${sources})"

      if [ -n "${modified}${untracked}" ]; then
        echo "codegen: the contract changed, but it was generated from files this commit leaves out:" >&2
        if [ -n "${modified}" ]; then
          echo "codegen:   modified, not staged:" >&2
          echo "${modified}" | sed 's/^/codegen:     /' >&2
        fi
        if [ -n "${untracked}" ]; then
          echo "codegen:   untracked:" >&2
          echo "${untracked}" | sed 's/^/codegen:     /' >&2
        fi
        echo "codegen: committing now would ship a contract this commit's own sources do not" >&2
        echo "codegen: produce, and the CI drift check would fail on it. Stage them with" >&2
        echo "codegen: \`git add\`, or set them aside with \`git stash -u\` — plain \`git stash\`" >&2
        echo "codegen: leaves untracked files behind — and commit again." >&2
        exit 1
      fi
    fi

    # What regeneration actually changed, relative to the index — not `${touched}`, which also
    # counts artefacts staged before the hook ran. Announcing those would credit the hook with
    # work it did not do, on exactly the commits that carry a legitimate contract change.
    delta="$(git diff --name-only -- ${artefacts}; git ls-files --others --exclude-standard -- ${artefacts})"
    [ -n "${delta}" ] || exit 0

    git add -- ${artefacts}
    echo "codegen: the contract moved — regenerated and added to this commit:"
    echo "${delta}"
    ;;
  # `git status` rather than `git diff --exit-code`: diff compares tracked content, so a file
  # the generator has only just started emitting — what a generator bump does — is untracked
  # and invisible to it. Verified, not assumed: with one generated file removed from the index,
  # `git diff --exit-code` exits 0 and this exits 1. Deletions diff does catch; status, both.
  check)
    drift="$(git status --porcelain -- ${artefacts})"
    if [ -n "${drift}" ]; then
      echo "codegen: the committed contract does not match what the code produces:" >&2
      echo "${drift}" >&2
      git --no-pager diff -- ${artefacts} >&2
      echo "codegen: run \`pnpm openapi && pnpm --filter @rondo/api-client codegen\` and commit the result." >&2
      exit 1
    fi
    ;;
esac
