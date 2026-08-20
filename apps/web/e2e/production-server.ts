import { HEALTH_URL } from '../src/lib/auth';

// F1.11: the suite is only evidence about production if a production build served it.
// Playwright builds and starts one itself, but locally it reuses whatever already answers on
// the port — and a `pnpm dev` server left in another terminal answers identically while being
// a different application (no minification, different static optimisation and caching,
// different server-component behaviour). Web servers are started before globalSetup runs, so
// that is the first moment the suite can ask which one it got; refusing there costs a second,
// while a green run against dev costs the whole point of the level.
//
// What it cannot see is **age**. `mode` comes from the bundle, so a production server built an
// hour ago from different sources answers exactly like one built just now, and reuse would test
// it. That is the deliberate edge of `reuseExistingServer`: it is for a server this suite left
// running, not for one kept warm across code changes (docs/testing.md says so too).
//
// It lives in its own module rather than inside global-setup.ts so that test/production-server.spec.ts
// can exercise it without loading Playwright and Clerk. A guard with no test is the failure
// mode this repository already refuses elsewhere: one that stops refusing looks exactly like
// one that had nothing to refuse.

/** Throws unless the server answering `baseUrl` is serving a production build. */
export async function assertProductionWebServer(baseUrl: string) {
  const url = `${baseUrl}${HEALTH_URL}`;
  // `redirect: 'manual'`, for the reason the Docker healthcheck carries the same option: if
  // this route ever leaves the public matcher in src/proxy.ts, clerkMiddleware answers 307 to
  // the sign-in page, fetch follows it to a 200 of HTML, and the useful error below is skipped
  // in favour of a bare JSON parse failure. That redirect once shipped a container that called
  // itself healthy while every Railway deploy failed.
  const response = await fetch(url, { redirect: 'manual' });

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} — expected the web app's liveness probe.`);
  }

  const mode = readMode(await response.json());
  if (mode !== 'production') {
    throw new Error(
      `${url} reports mode "${mode}", not "production": e2e are running against a development ` +
        'server, which proves nothing about the build that ships. Stop whatever is on that port ' +
        'and let Playwright build, or serve a production build yourself: ' +
        '`pnpm --filter @rondo/web build && pnpm --filter @rondo/web start`.',
    );
  }
}

/**
 * The `mode` of a health response, or undefined when the answer is not one.
 *
 * A narrowing function rather than a cast: this is an external boundary, and whatever holds
 * that port is not necessarily our app at all (code-quality.md). Anything unrecognisable
 * becomes `undefined`, which fails the check above — the comparison is against `'production'`,
 * so an unreadable answer refuses rather than passes.
 */
function readMode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('mode' in body)) return undefined;

  const { mode } = body;
  return typeof mode === 'string' ? mode : undefined;
}
