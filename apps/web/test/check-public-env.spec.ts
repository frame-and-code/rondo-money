/**
 * The fast-fail that runs before every build of this app (F1.11) — the image build in
 * apps/web/Dockerfile and the web server Playwright starts. Both inline `NEXT_PUBLIC_*` into
 * the browser bundle, so what this script rejects is the difference between a deploy that
 * fails at once and one that serves an app nobody can sign in to. Until now the same rules
 * lived in a `RUN node -e` line and were covered by nothing.
 *
 * The script is run as a real process rather than imported: its answer *is* the exit code,
 * and the Dockerfile and Playwright both consume it that way.
 *
 * @jest-environment node
 */
import { execFile } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'check-public-env.mjs');

// A publishable key is not a secret, but it is key-shaped: the "never printed" test below
// needs a value it can look for, and a real one must never end up in this file.
const FAKE_CLERK_KEY = 'pk_test_fake-value-for-this-test-only';

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the script with exactly the given variables and nothing else.
 *
 * `NODE_ENV=test` is what keeps this hermetic: @next/env skips `.env.local` entirely in that
 * mode, so a developer's real keys cannot turn a "missing variable" case green. The script's
 * own rules do not look at NODE_ENV.
 */
function run(mode: string, env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, mode],
      { env: { NODE_ENV: 'test', ...env } },
      (error, stdout, stderr) => {
        const code = typeof error?.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

// Spelled as two objects so a case can leave NEXT_PUBLIC_API_URL genuinely **unset** rather
// than empty — the script treats those differently, and the difference is the point of two of
// the cases below.
const WITHOUT_API_URL = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_CLERK_KEY };
const VALID = { ...WITHOUT_API_URL, NEXT_PUBLIC_API_URL: 'https://api.example.com' };

describe('check-public-env, image mode (the Railway build)', () => {
  it('passes when both variables are there', async () => {
    await expect(run('image', VALID)).resolves.toMatchObject({ code: 0 });
  });

  it('refuses a build with no Clerk key — the bundle could authenticate nobody', async () => {
    const { code, stderr } = await run('image', {
      ...VALID,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
    });

    expect(code).toBe(1);
    expect(stderr).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });

  it('refuses a build with no API URL — a deployed bundle must not fall back to localhost', async () => {
    const { code, stderr } = await run('image', WITHOUT_API_URL);

    expect(code).toBe(1);
    expect(stderr).toContain('NEXT_PUBLIC_API_URL');
  });

  // The F1.7 regression, now covered: a truncated paste passed the old non-empty check and
  // shipped a bundle that could not reach the api. The client concatenates baseUrl + route,
  // so anything beyond a bare origin misroutes every request just as quietly.
  it.each([
    ['a scheme with no host', 'https://'],
    ['a bare host', 'api.example.com'],
    ['a trailing slash', 'https://api.example.com/'],
    ['a path', 'https://api.example.com/v1'],
    ['a query', 'https://api.example.com?x=1'],
  ])('refuses %s as NEXT_PUBLIC_API_URL', async (_case, value) => {
    const { code, stderr } = await run('image', { ...VALID, NEXT_PUBLIC_API_URL: value });

    expect(code).toBe(1);
    expect(stderr).toContain('exact http(s) origin');
  });

  it('names the origin it expected, so the fix does not need a second run', async () => {
    const { stderr } = await run('image', {
      ...VALID,
      NEXT_PUBLIC_API_URL: 'https://api.example.com/v1',
    });

    expect(stderr).toContain('expected "https://api.example.com"');
  });
});

describe('check-public-env, e2e mode (the server Playwright starts)', () => {
  it('allows an unset API URL — src/lib/api/config.ts falls back to the local api', async () => {
    const { code } = await run('e2e', WITHOUT_API_URL);

    expect(code).toBe(0);
  });

  // Empty is not unset, and this is the one that would ship quietly: `??` keeps an empty
  // string, so the generated client would resolve every route against the web app's own
  // origin — :3001 instead of the api — with nothing failing at build time.
  it('refuses an empty API URL, which `??` does not fall back on', async () => {
    const { code, stderr } = await run('e2e', { ...VALID, NEXT_PUBLIC_API_URL: '' });

    expect(code).toBe(1);
    expect(stderr).toContain('empty string');
  });

  it('still refuses a malformed API URL', async () => {
    const { code } = await run('e2e', { ...VALID, NEXT_PUBLIC_API_URL: 'https://' });

    expect(code).toBe(1);
  });

  // Locally a keyless run is a valid partial one — the specs that need a session skip
  // themselves (e2e/clerk.ts). Failing here would make a fresh clone unable to run any e2e.
  it('warns without a Clerk key outside CI, and lets the run continue', async () => {
    const { code, stderr } = await run('e2e', { ...VALID, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' });

    expect(code).toBe(0);
    expect(stderr).toContain('WARNING');
  });

  // In CI the keys are guaranteed — the workflow skips the whole job without them — so a
  // missing one there is a broken secret. A green run must never mean "auth was never tested".
  it('fails without a Clerk key in CI', async () => {
    const { code, stderr } = await run('e2e', {
      ...VALID,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      CI: 'true',
    });

    expect(code).toBe(1);
    expect(stderr).toContain('ERROR');
  });
});

describe('check-public-env, whatever the mode', () => {
  it('reports every problem at once — a build is slow enough not to be told twice', async () => {
    const { stderr } = await run('image', {
      NEXT_PUBLIC_API_URL: '',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
    });

    expect(stderr).toContain('NEXT_PUBLIC_API_URL');
    expect(stderr).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });

  it('never prints the key itself — CI logs are public', async () => {
    const { stdout, stderr } = await run('image', { ...VALID, NEXT_PUBLIC_API_URL: 'https://' });

    expect(stdout).not.toContain(FAKE_CLERK_KEY);
    expect(stderr).not.toContain(FAKE_CLERK_KEY);
  });

  it('refuses an unknown mode instead of guessing which rules to apply', async () => {
    const { code, stderr } = await run('whatever', VALID);

    expect(code).toBe(1);
    expect(stderr).toContain('usage');
  });
});
