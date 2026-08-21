import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

const MODES = ['image', 'e2e'];
const mode = process.argv[2];

if (!MODES.includes(mode)) {
  fail([`usage: node check-public-env.mjs <${MODES.join('|')}>`]);
}

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
  problems.push(
    'NEXT_PUBLIC_API_URL is set to an empty string, which is not the same as leaving it unset: ' +
      'the `??` fallback in src/lib/api/config.ts keeps it, so every request would go to the web ' +
      "app's own origin instead of the api. Give it an exact http(s) origin (in the image: pass " +
      'the build arg), or unset it entirely.',
  );
} else {
  const origin = originOf(apiUrl);
  if (origin !== apiUrl || !/^https?:\/\//.test(apiUrl)) {
    const expected = origin && origin !== apiUrl ? `, expected "${origin}"` : '';
    problems.push(
      'NEXT_PUBLIC_API_URL must be an exact http(s) origin, with no path, query or trailing ' +
        `slash (it is baked into the browser bundle): got "${apiUrl}"${expected}.`,
    );
  }
}

if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
  const message =
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. It is inlined into the browser bundle, so ' +
    'a build without it serves an app that cannot authenticate anyone. Locally: `pnpm env:setup` ' +
    '(or copy apps/web/.env.local.tpl and fill it in); in CI: GitHub → Settings → Secrets → Actions.';

  if (mode === 'image' || process.env.CI) {
    problems.push(message);
  } else {
    console.warn(`WARNING: ${message}`);
  }
}

if (problems.length > 0) {
  fail(problems);
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function fail(messages) {
  for (const message of messages) {
    console.error(`ERROR: ${message}`);
  }
  process.exit(1);
}
