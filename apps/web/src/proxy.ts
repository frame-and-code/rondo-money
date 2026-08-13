import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { HEALTH_URL, SIGN_IN_URL } from '@/lib/auth';

// clerkMiddleware() alone only attaches auth context — it protects nothing (F1.1 step 5).
// auth.protect() below is the actual gate: unauthenticated requests to any non-public
// route get a 307 to the sign-in page with a return URL. The sign-in route comes from
// the shared SIGN_IN_URL constant (see src/lib/auth.ts) — both the public matcher and
// the redirect target derive from it, so they cannot drift apart.
// Sign-up is deliberately not a route: users sign in with Google/email, and OAuth
// auto-creates the account.
// The health route is public for the platform's benefit: Railway's healthcheck is
// anonymous, does not follow redirects and accepts only 2xx, so protecting it would make
// every deploy fail its healthcheck (which is exactly what happened between F1.1 and this
// change — the probe still pointed at `/`).
const isPublicRoute = createRouteMatcher([`${SIGN_IN_URL}(.*)`, HEALTH_URL, '/__clerk(.*)']);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  { signInUrl: SIGN_IN_URL },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for Clerk's auto-proxy path
    '/__clerk/:path*',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
