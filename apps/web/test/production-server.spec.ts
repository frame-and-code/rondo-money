/**
 * The refusal that keeps e2e honest (F1.11): the suite must not run against anything but a
 * production build, and locally Playwright will reuse whatever already holds the port.
 *
 * It is tested for the same reason the guard hooks in `.claude/hooks` are — a refusal that
 * stopped firing looks exactly like one that had nothing to refuse. In CI the accept path is
 * the only one ever taken (`reuseExistingServer` is off there), so without this the reject
 * path would ship unexercised.
 *
 * A real HTTP server rather than a mocked `fetch`: what is being checked is how the guard
 * treats an answer off the wire — a redirect, HTML, a body that is not ours at all.
 *
 * @jest-environment node
 */
import { createServer, type Server } from 'node:http';

import { HEALTH_URL } from '@/lib/auth';

import { assertProductionWebServer } from '../e2e/production-server';

import type { AddressInfo } from 'node:net';

interface Answer {
  status?: number;
  headers?: Record<string, string>;
  body: string;
}

let server: Server;
let baseUrl: string;
let answer: Answer;

beforeAll(async () => {
  server = createServer((request, response) => {
    // Everything is answered the same way: what matters is what the guard does with the
    // body, and asserting the path here would only restate HEALTH_URL.
    expect(request.url).toBe(HEALTH_URL);
    response.writeHead(answer.status ?? 200, {
      'content-type': 'application/json',
      ...answer.headers,
    });
    response.end(answer.body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('assertProductionWebServer', () => {
  it('accepts a production build', async () => {
    answer = { body: JSON.stringify({ status: 'ok', mode: 'production' }) };

    await expect(assertProductionWebServer(baseUrl)).resolves.toBeUndefined();
  });

  // The whole point of F1.11: `next dev` is a different application, so a green run against
  // it proves nothing about what ships.
  it('refuses a development server, and says what to do about it', async () => {
    answer = { body: JSON.stringify({ status: 'ok', mode: 'development' }) };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/mode "development"/);
    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(
      /Stop whatever is on that port/,
    );
  });

  // Whatever holds that port is not necessarily our app. Anything unreadable must refuse
  // rather than pass — the comparison is against 'production', so this fails closed.
  it.each([
    ['no mode field', JSON.stringify({ status: 'ok' })],
    ['a mode that is not a string', JSON.stringify({ mode: 42 })],
    ['a JSON array', '[]'],
    ['null', 'null'],
  ])('refuses an answer with %s', async (_case, body) => {
    answer = { body };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/not "production"/);
  });

  it('refuses a non-2xx answer, naming the status', async () => {
    answer = { status: 503, body: JSON.stringify({ mode: 'production' }) };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/answered 503/);
  });

  // The regression this guard's `redirect: 'manual'` exists for: if the health route ever
  // leaves the public matcher, Clerk answers 307 to the sign-in page. Following that would
  // land on a 200 of HTML and fail with a bare JSON parse error instead of the status.
  it('does not follow a redirect into a page of HTML', async () => {
    answer = { status: 307, headers: { location: '/sign-in' }, body: '' };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/answered 307/);
  });
});
