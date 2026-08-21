/** @jest-environment node */
import { execFile } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'check-public-env.mjs');

const FAKE_CLERK_KEY = 'pk_test_fake-value-for-this-test-only';

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

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

const WITHOUT_API_URL = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_CLERK_KEY };
const VALID = { ...WITHOUT_API_URL, NEXT_PUBLIC_API_URL: 'https://api.example.com' };

describe('check-public-env, image mode (the Railway build)', () => {
  it('passes when both variables are there', async () => {
    await expect(run('image', VALID)).resolves.toMatchObject({ code: 0 });
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])(
    'refuses a build whose Clerk key is %s — the bundle could authenticate nobody',
    async (_case, value) => {
      const { code, stderr } = await run('image', {
        ...VALID,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value,
      });

      expect(code).toBe(1);
      expect(stderr).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    },
  );

  it('refuses a build with no API URL — a deployed bundle must not fall back to localhost', async () => {
    const { code, stderr } = await run('image', WITHOUT_API_URL);

    expect(code).toBe(1);
    expect(stderr).toContain('NEXT_PUBLIC_API_URL');
  });

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

  it('refuses an empty API URL, which `??` does not fall back on', async () => {
    const { code, stderr } = await run('e2e', { ...VALID, NEXT_PUBLIC_API_URL: '' });

    expect(code).toBe(1);
    expect(stderr).toContain('empty string');
  });

  it('still refuses a malformed API URL', async () => {
    const { code } = await run('e2e', { ...VALID, NEXT_PUBLIC_API_URL: 'https://' });

    expect(code).toBe(1);
  });

  it('warns without a Clerk key outside CI, and lets the run continue', async () => {
    const { code, stderr } = await run('e2e', { ...VALID, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' });

    expect(code).toBe(0);
    expect(stderr).toContain('WARNING');
  });

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
