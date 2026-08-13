// Single source of truth for the sign-in route (F1.1). It is wired into Clerk in code —
// the clerkMiddleware options in src/proxy.ts and the ClerkProvider prop — rather than
// via the NEXT_PUBLIC_CLERK_SIGN_IN_URL env variable: the route is fixed by the app/
// directory structure and identical in every environment, so an env knob would only add
// ways to misconfigure it (a forgotten variable silently breaks redirects).
export const SIGN_IN_URL = '/sign-in';

// The platform's liveness probe (src/app/api/health/route.ts). It lives here for the same
// reason as SIGN_IN_URL: the public matcher in src/proxy.ts, the route itself and
// healthcheckPath in railway.json all have to name the same path, and one constant is
// what stops them drifting apart. Changing it means changing railway.json too.
export const HEALTH_URL = '/api/health';
