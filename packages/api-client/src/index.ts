import { client } from './generated/client.gen';

/** Request functions and the types of every request and response, generated from the spec. */
export * from './generated';

/**
 * Zod schemas for the response shapes, generated from the same spec.
 *
 * Nothing parses with them yet — the client does not validate on its own. The first real
 * consumer is Phase 3, where an amount arrives as a string and has to be checked before it
 * becomes a `bigint`.
 */
export * as schemas from './generated/zod.gen';

/** Hands back the caller's Clerk session token, or `null` when there is no session. */
export type SessionTokenReader = () => Promise<string | null>;

export interface ApiClientOptions {
  /** Origin of the API, e.g. `http://localhost:3000`. */
  baseUrl: string;
  getToken: SessionTokenReader;
}

/**
 * Point the generated client at an API and teach it how to get a token. Call once, before
 * anything issues a request.
 *
 * The token is **not** attached to everything. Each generated request function carries the
 * `security` its operation declares in the spec, and the client only resolves `auth` when it
 * finds one — so `GET /me` gets a bearer header and the public healthcheck is called
 * anonymously, without this package holding a list of which paths are open. That list would
 * be a second source of truth for something `@Public()` already decides in `apps/api`.
 *
 * `getToken` is stored rather than called: Clerk hands back a refreshed token per call, and
 * capturing one here would pin the session to whatever was valid at startup.
 */
export function configureApiClient({ baseUrl, getToken }: ApiClientOptions): void {
  client.setConfig({
    baseUrl,
    // The generated `auth` contract is `string | undefined`; Clerk's is `string | null`.
    auth: async () => (await getToken()) ?? undefined,
  });
}
