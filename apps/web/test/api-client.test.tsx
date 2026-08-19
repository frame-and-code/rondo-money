import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';

import { ApiProvider } from '@/lib/api';

// Proves what this provider exists to do (F1.4): point the generated client at the configured
// API, hand it Clerk's token *lazily* so each request gets a fresh one, and keep one user's
// cached data out of the next user's session on the same tab.

const mockGetToken = jest.fn();
const mockConfigureApiClient = jest.fn();
let mockUserId: string | null = 'user_a';

jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: mockGetToken, userId: mockUserId, isLoaded: true }),
}));

jest.mock('@rondo/api-client', () => ({
  configureApiClient: (options: unknown) => mockConfigureApiClient(options) as unknown,
}));

/** The options the provider passed to the generated client. */
function configuration(): { baseUrl: string; getToken: () => Promise<string | null> } {
  const call = mockConfigureApiClient.mock.calls[0];

  if (!call) {
    throw new Error('configureApiClient was never called');
  }

  const [options] = call;

  if (typeof options !== 'object' || options === null) {
    throw new Error('configureApiClient was called without options');
  }

  return options as { baseUrl: string; getToken: () => Promise<string | null> };
}

describe('ApiProvider', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockConfigureApiClient.mockReset();
    mockGetToken.mockResolvedValue('session.token');
    mockUserId = 'user_a';
  });

  it('points the client at the configured API before rendering anything below it', () => {
    render(
      <ApiProvider>
        <p>screen</p>
      </ApiProvider>,
    );

    // Configuration has to happen during render, not in an effect: a parent's effects run
    // after its children's, so a screen's first query would go out unconfigured.
    expect(configuration().baseUrl).toBe('http://localhost:3000');
    expect(screen.getByText('screen')).toBeInTheDocument();
  });

  it('hands over a token reader rather than a token, so each request gets a fresh one', async () => {
    render(
      <ApiProvider>
        <p>screen</p>
      </ApiProvider>,
    );

    // Nothing is fetched just because the tree rendered.
    expect(mockGetToken).not.toHaveBeenCalled();

    await expect(configuration().getToken()).resolves.toBe('session.token');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  // The claim the cache-per-identity exists to make, asserted on data rather than on the
  // client instance: a screen that is already on the page must not go on showing what the
  // previous user's session fetched. Every screen is in that position — the provider lives in
  // the root layout, and signing out and back in is a soft navigation, so nothing unmounts.
  it("does not serve a mounted screen the previous user's cached response", async () => {
    function Screen() {
      // A generated query key, which carries no identity — exactly what the app's screens use.
      const { data } = useQuery({ queryKey: ['me'], queryFn: () => Promise.resolve(mockUserId) });
      return <p>{`caller:${data ?? 'loading'}`}</p>;
    }

    const { rerender } = render(
      <ApiProvider>
        <Screen />
      </ApiProvider>,
    );
    expect(await screen.findByText('caller:user_a')).toBeInTheDocument();

    mockUserId = 'user_b';
    rerender(
      <ApiProvider>
        <Screen />
      </ApiProvider>,
    );

    expect(await screen.findByText('caller:user_b')).toBeInTheDocument();
  });

  it('keeps the subtree mounted while doing so, rather than rebuilding every screen', async () => {
    let mounts = 0;

    function Screen() {
      const { data } = useQuery({ queryKey: ['me'], queryFn: () => Promise.resolve(mockUserId) });
      useEffect(() => {
        mounts += 1;
      }, []);

      return <p>{`caller:${data ?? 'loading'}`}</p>;
    }

    const { rerender } = render(
      <ApiProvider>
        <Screen />
      </ApiProvider>,
    );
    await screen.findByText('caller:user_a');

    mockUserId = 'user_b';
    rerender(
      <ApiProvider>
        <Screen />
      </ApiProvider>,
    );
    await screen.findByText('caller:user_b');

    // The subtree here is the whole app — the theme provider and every screen — and `userId`
    // goes from `undefined` to the signed-in user on every page load, so remounting on a change
    // of identity would rebuild all of it once per load rather than once per user.
    expect(mounts).toBe(1);
  });
});
