import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { HEALTH_URL, SIGN_IN_URL } from '@/lib/auth';

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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/:path*',
    '/(api|trpc)(.*)',
  ],
};
