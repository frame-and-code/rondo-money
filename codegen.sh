#!/usr/bin/env sh
set -e

mode="${1:-check}"

case "${mode}" in
  stage | check) ;;
  *)
    echo "usage: ${0} [stage|check]" >&2
    exit 2
    ;;
esac

artefacts='apps/api/openapi.json packages/api-client/src/generated'

sources='apps/api/src packages/types/src packages/api-client/openapi-ts.config.ts'

pnpm openapi
pnpm --filter @rondo/api-client codegen

case "${mode}" in
  stage)
    touched="$(git status --porcelain -- ${artefacts})"

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

    delta="$(git diff --name-only -- ${artefacts}; git ls-files --others --exclude-standard -- ${artefacts})"
    [ -n "${delta}" ] || exit 0

    git add -- ${artefacts}
    echo "codegen: the contract moved — regenerated and added to this commit:"
    echo "${delta}"
    ;;
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
