// Liveness probe for the platform (F0.10 — Railway's healthcheckPath in railway.json).
//
// It exists as its own route because every page is behind Clerk since F1.1: an
// unauthenticated GET / answers 307 to the sign-in page, and Railway's healthcheck
// neither follows redirects nor accepts anything but 2xx, so a deploy could never
// become healthy. This route is listed in the public matcher in src/proxy.ts, which is
// what keeps it answering 200 to an anonymous probe.
//
// Deliberately shallow: it says "this server process is up and serving", nothing more.
// The web app owns no database connection — @rondo/api has its own /health for that — so
// there is nothing further to check here, and a probe that reached out to dependencies
// would take the whole deployment down whenever one of them blinked.

// Never prerender this: a probe must reflect the running instance, not build-time output.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
