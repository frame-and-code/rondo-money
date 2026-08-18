/**
 * Where the @rondo/api backend lives.
 *
 * `NEXT_PUBLIC_` so the value is inlined into the browser bundle. The fallback points
 * at the local API port (see apps/api) so `next dev`/`next build` work with no
 * `.env.local`; on Railway set `NEXT_PUBLIC_API_URL` to the deployed API.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
