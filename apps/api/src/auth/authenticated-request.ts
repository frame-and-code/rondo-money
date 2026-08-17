/**
 * The identity `ClerkAuthGuard` derived from the verified token. This is the single source
 * of the caller's identity for everything downstream — never the body, the query or a
 * header (see `.claude/rules/security.md`).
 */
export interface RequestAuth {
  userId: string;
}

/**
 * The part of the HTTP request the auth layer touches. Structural on purpose rather than
 * express's `Request`: `apps/api` installs no express types, and the guard needs nothing
 * beyond the header it reads and the slot it writes.
 */
export interface AuthenticatedRequest {
  headers: { authorization?: string };
  auth?: RequestAuth;
}
