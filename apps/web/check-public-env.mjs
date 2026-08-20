// F1.11 — the fast-fail for the variables that are baked into the browser bundle.
//
// `NEXT_PUBLIC_*` are inlined by `next build`, not read when the server starts. So a
// missing or malformed one produces a build that succeeds and an app that does not: an
// empty Clerk key makes `clerkMiddleware` reject every request, and a mistyped API URL
// misroutes every call the generated client makes (it concatenates baseUrl + route). Both
// failures surface far from their cause, which is why this runs before the build rather
// than leaving it to be noticed in a browser.
//
// Two callers, one rule set — the same shape as secret-scan.sh and codegen.sh:
//
//   image  the Railway image build (apps/web/Dockerfile). Both variables are required:
//          a deployed bundle has no local fallback worth shipping.
//   e2e    the web server Playwright starts (playwright.config.ts). NEXT_PUBLIC_API_URL
//          may be absent — src/lib/api/config.ts falls back to the local api, which is
//          the right address in CI — and the Clerk key is required only in CI, where its
//          absence is a broken secret rather than a valid partial run. That is the same
//          split e2e/clerk.ts applies to the specs themselves.

// A default import, unlike the named one in e2e/global-setup.ts: @next/env ships a single
// bundled CommonJS file, and Node's ESM loader cannot detect named exports in it. TypeScript
// hides that difference; a plain .mjs does not.
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

const MODES = ['image', 'e2e'];
const mode = process.argv[2];

if (!MODES.includes(mode)) {
  fail([`usage: node check-public-env.mjs <${MODES.join('|')}>`]);
}

// A plain Node process reads no .env file. Load them the way the build that follows will —
// from this file's own directory rather than from the cwd, because the Dockerfile calls
// this from the repository root while Playwright calls it from apps/web. Values already
// in the environment win over the files, so CI keeps deciding what the build sees.
loadEnvConfig(import.meta.dirname);

const problems = [];

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (apiUrl === undefined) {
  if (mode === 'image') {
    problems.push(
      'NEXT_PUBLIC_API_URL is required: it is baked into the browser bundle, and a deployed ' +
        'image must not fall back to the localhost address in src/lib/api/config.ts.',
    );
  }
} else if (apiUrl === '') {
  // Empty is not the same as unset, and this is the difference that bites: src/lib/api/config.ts
  // falls back with `??`, which keeps an empty string. The generated client would then resolve
  // every route against the web app's own origin — requests to :3001 instead of the api, with
  // nothing failing at build time. Rejected in both modes for that reason; the Dockerfile's
  // `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL` produces exactly this when the build arg is
  // not passed.
  problems.push(
    'NEXT_PUBLIC_API_URL is set to an empty string, which is not the same as leaving it unset: ' +
      'the `??` fallback in src/lib/api/config.ts keeps it, so every request would go to the web ' +
      "app's own origin instead of the api. Give it an exact http(s) origin (in the image: pass " +
      'the build arg), or unset it entirely.',
  );
} else {
  // Non-empty is not enough. A truncated paste ("https://", a bare host) once passed that
  // check and shipped a bundle that could not reach the api (F1.7); a path, query or
  // trailing slash would misroute every request just as silently. The contract is the same
  // `new URL().origin` one `assertWebOriginConfigured` enforces for WEB_ORIGIN on the api side.
  const origin = originOf(apiUrl);
  if (origin !== apiUrl || !/^https?:\/\//.test(apiUrl)) {
    const expected = origin && origin !== apiUrl ? `, expected "${origin}"` : '';
    problems.push(
      'NEXT_PUBLIC_API_URL must be an exact http(s) origin, with no path, query or trailing ' +
        `slash (it is baked into the browser bundle): got "${apiUrl}"${expected}.`,
    );
  }
}

// `.trim()`: whitespace is not a key, and the shell check this replaced (`[ -n "$KEY" ]`)
// accepted "   " — which builds cleanly and then rejects every request in clerkMiddleware.
// The URL branch above already refuses whitespace, because `new URL(' ')` throws.
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
  const message =
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. It is inlined into the browser bundle, so ' +
    'a build without it serves an app that cannot authenticate anyone. Locally: `pnpm env:setup` ' +
    '(or copy apps/web/.env.local.tpl and fill it in); in CI: GitHub → Settings → Secrets → Actions.';

  // In CI the keys are guaranteed — the workflow skips the whole e2e job without them — so a
  // missing key there is a broken secret, not a mode.
  if (mode === 'image' || process.env.CI) {
    problems.push(message);
  } else {
    console.warn(`WARNING: ${message}`);
  }
}

if (problems.length > 0) {
  fail(problems);
}

/** The origin of a URL, or null when it is not a URL at all. */
function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Prints every problem at once — a build is slow enough that one round trip should list all of them. */
function fail(messages) {
  for (const message of messages) {
    console.error(`ERROR: ${message}`);
  }
  process.exit(1);
}
