/**
 * Where the @rondo/api backend lives.
 *
 * F0.5 scope is just "a base client + env for the API address". The typed,
 * OpenAPI-generated client (`@rondo/api-client`, ADR-002) arrives in F1 and will
 * supersede this; until then this constant is the single source of the API origin.
 *
 * `NEXT_PUBLIC_` so the value is inlined into the browser bundle. The fallback points
 * at the local API port (see apps/api) so `next dev`/`next build` work with no
 * `.env.local`; on Railway set `NEXT_PUBLIC_API_URL` to the deployed API.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
