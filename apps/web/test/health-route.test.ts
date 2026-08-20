/**
 * The liveness probe the platform calls (F0.10). `node` rather than the project-wide
 * jsdom: a route handler runs on the server and answers with a web `Response`.
 *
 * @jest-environment node
 */
import { GET } from '@/app/api/health/route';
import { HEALTH_URL } from '@/lib/auth';

import railwayConfig from '../railway.json';

describe('health route', () => {
  it('answers 200 to an anonymous probe', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', mode: process.env.NODE_ENV });
  });

  // F1.11: e2e/global-setup.ts reads this field to refuse a `next dev` server on the port, so
  // the suite cannot quietly stop being evidence about the build that ships.
  //
  // What this can prove is that the field is there and comes from NODE_ENV. It cannot prove
  // the value the e2e guard actually compares: in a real build Next replaces
  // `process.env.NODE_ENV` with a literal (`define-env.js`), while @swc/jest inlines nothing,
  // so here it is simply the test process's own value. The suite itself is what exercises the
  // built one.
  it('reports the mode it was built in, taken from NODE_ENV', async () => {
    const { mode } = (await GET().json()) as { mode?: string };

    expect(mode).toBe(process.env.NODE_ENV);
    expect(mode).toBeDefined();
  });

  it('does not redirect — Railway rejects anything that is not 2xx', () => {
    expect(GET().redirected).toBe(false);
  });

  // The regression this whole route exists for: between F1.1 and F0.10's fix, Clerk began
  // protecting `/` while railway.json still probed it, so every deploy failed its
  // healthcheck. Path and probe now derive from one constant — this keeps them that way.
  it('is the path Railway actually probes', () => {
    expect(railwayConfig.deploy.healthcheckPath).toBe(HEALTH_URL);
  });
});
