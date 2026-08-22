/** @jest-environment node */
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

  it('refuses a development server, and says what to do about it', async () => {
    answer = { body: JSON.stringify({ status: 'ok', mode: 'development' }) };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/mode "development"/);
    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(
      /Stop whatever is on that port/,
    );
  });

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

  it('does not follow a redirect into a page of HTML', async () => {
    answer = { status: 307, headers: { location: '/sign-in' }, body: '' };

    await expect(assertProductionWebServer(baseUrl)).rejects.toThrow(/answered 307/);
  });
});
