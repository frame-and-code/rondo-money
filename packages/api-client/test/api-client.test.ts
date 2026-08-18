import { configureApiClient, healthControllerCheck, meControllerIdentify } from '@rondo/api-client';

const BASE_URL = 'https://api.rondo.test';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * The `Request` the client handed to `fetch`, or a failure that says which of the two things
 * went wrong — no call at all, or a call shaped differently than expected.
 */
function sentRequest(mock: jest.MockedFunction<typeof fetch>): Request {
  const call = mock.mock.calls[0];

  if (!call) {
    throw new Error('fetch was never called');
  }

  const [input] = call;

  if (!(input instanceof Request)) {
    throw new Error(`expected fetch to be called with a Request, got ${typeof input}`);
  }

  return input;
}

describe('the generated API client', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let getToken: jest.MockedFunction<() => Promise<string | null>>;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    getToken = jest.fn();
    getToken.mockResolvedValue('session.token');
    configureApiClient({ baseUrl: BASE_URL, getToken });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends the session token as a bearer credential against the configured API', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ userId: 'user_2rondo' }));

    const { data, error } = await meControllerIdentify();

    const request = sentRequest(fetchMock);
    expect(request.url).toBe(`${BASE_URL}/me`);
    expect(request.headers.get('Authorization')).toBe('Bearer session.token');
    expect(error).toBeUndefined();
    expect(data).toEqual({ userId: 'user_2rondo' });
  });

  it('asks for the token per request, so an expired one is refreshed rather than reused', async () => {
    // A fresh Response per call: a body can only be read once, so a shared one would fail the
    // second request for a reason that has nothing to do with what is under test.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ userId: 'user_2rondo' })));
    getToken.mockResolvedValueOnce('first.token').mockResolvedValueOnce('second.token');

    await meControllerIdentify();
    await meControllerIdentify();

    expect(getToken).toHaveBeenCalledTimes(2);
    const secondRequest = fetchMock.mock.calls[1]?.[0];
    expect(secondRequest instanceof Request && secondRequest.headers.get('Authorization')).toBe(
      'Bearer second.token',
    );
  });

  it('calls a public endpoint anonymously, without ever asking for a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', info: { database: 'up' } }));

    await healthControllerCheck();

    // Nothing here lists which paths are open. `@Public()` in apps/api clears the security
    // requirement in the spec, the generated request function carries that through, and the
    // client only resolves a token where an operation declares one. A hardcoded list of
    // public paths would be a second source of truth for the same decision.
    expect(getToken).not.toHaveBeenCalled();
    expect(sentRequest(fetchMock).headers.get('Authorization')).toBeNull();
  });

  it('reports an API error as a typed value instead of throwing', async () => {
    // The body the guard actually produces, and now the one the spec documents. While the 401
    // carried no schema the generated type for it was `unknown`, so an assertion here proved
    // nothing about the API — `error.message` below only compiles because it is described.
    const unauthorized = {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid session token',
    };
    fetchMock.mockResolvedValue(jsonResponse(unauthorized, 401));

    const { data, error } = await meControllerIdentify();

    expect(data).toBeUndefined();
    expect(error).toEqual(unauthorized);
    expect(error?.message).toBe('Invalid session token');
  });
});
