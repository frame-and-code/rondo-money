// Liveness probe for the platform (F0.10 — Railway's healthcheckPath in railway.json).
//
// It exists as its own route because every page is behind Clerk since F1.1: an
// unauthenticated GET / answers 307 to the sign-in page, and Railway's healthcheck
// neither follows redirects nor accepts anything but 2xx, so a deploy could never
// become healthy. This route is listed in the public matcher in src/proxy.ts, which is
// what keeps it answering 200 to an anonymous probe.
//
// Deliberately shallow: it says "this server process is up, and in which mode", nothing
// more. The web app owns no database connection — @rondo/api has its own /health for that
// — so there is nothing further to check here, and a probe that reached out to
// dependencies would take the whole deployment down whenever one of them blinked.
//
// `mode` exists for the e2e suite (F1.11), which must never run against `next dev`: the specs
// are only evidence about production if a production build served them. Playwright may reuse a
// server that is already listening on the port, and this is what lets e2e/global-setup.ts tell
// which one it got. Nothing secret, and Railway ignores everything but the status code.
//
// Read it as the mode the bundle was **built** in, never as the process's `NODE_ENV`: Next
// replaces `process.env.NODE_ENV` with a literal while compiling (`define-env.js`), so a
// production bundle answers "production" even when started with `NODE_ENV=development`. For
// the guard that is the better question anyway — it asks which build is being served, not how
// it was launched.

// Never prerender this: a probe must reflect the running instance, not build-time output.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', mode: process.env.NODE_ENV });
}
