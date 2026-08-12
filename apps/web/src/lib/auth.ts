// Single source of truth for the sign-in route (F1.1). It is wired into Clerk in code —
// the clerkMiddleware options in src/proxy.ts and the ClerkProvider prop — rather than
// via the NEXT_PUBLIC_CLERK_SIGN_IN_URL env variable: the route is fixed by the app/
// directory structure and identical in every environment, so an env knob would only add
// ways to misconfigure it (a forgotten variable silently breaks redirects).
export const SIGN_IN_URL = '/sign-in';
