/** @jest-environment node */
import { GET } from '@/app/api/health/route';
import { HEALTH_URL } from '@/lib/auth';

import railwayConfig from '../railway.json';

describe('health route', () => {
  it('answers 200 to an anonymous probe', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', mode: process.env.NODE_ENV });
  });

  it('reports the mode it was built in, taken from NODE_ENV', async () => {
    await expect(GET().json()).resolves.toMatchObject({ mode: expect.any(String) });
  });

  it('does not redirect — Railway rejects anything that is not 2xx', () => {
    expect(GET().redirected).toBe(false);
  });

  it('is the path Railway actually probes', () => {
    expect(railwayConfig.deploy.healthcheckPath).toBe(HEALTH_URL);
  });
});
