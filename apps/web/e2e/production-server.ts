import { HEALTH_URL } from '../src/lib/auth';

export async function assertProductionWebServer(baseUrl: string) {
  const url = `${baseUrl}${HEALTH_URL}`;
  const response = await fetch(url, { redirect: 'manual' });

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} — expected the web app's liveness probe.`);
  }

  const mode = readMode(await response.json());
  if (mode !== 'production') {
    throw new Error(
      `${url} reports mode "${mode}", not "production": e2e are running against a development ` +
        'server, which proves nothing about the build that ships. Stop whatever is on that port ' +
        'and let Playwright build, or serve a production build yourself: ' +
        '`pnpm --filter @rondo/web build && pnpm --filter @rondo/web start`.',
    );
  }
}

function readMode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('mode' in body)) return undefined;

  const { mode } = body;
  return typeof mode === 'string' ? mode : undefined;
}
