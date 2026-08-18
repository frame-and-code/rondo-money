import { useQueryClient, type QueryClient } from '@tanstack/react-query';
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

  it('gives a second user a cache of their own, so they cannot read the first one’s data', () => {
    const seen = new Set<QueryClient>();
    let mounts = 0;

    function Probe() {
      seen.add(useQueryClient());
      useEffect(() => {
        mounts += 1;
      }, []);

      return null;
    }

    // Signing out and back in as someone else is a soft navigation: this provider is in the
    // root layout and never unmounts, and the generated query keys carry no user id. Without a
    // cache scoped to the identity, user B would read A's data straight out of it.
    const { rerender } = render(
      <ApiProvider>
        <Probe />
      </ApiProvider>,
    );
    mockUserId = 'user_b';
    rerender(
      <ApiProvider>
        <Probe />
      </ApiProvider>,
    );

    expect(seen.size).toBe(2);
    // Swapped, not remounted: the subtree here is the whole app — the theme provider and every
    // screen — and rebuilding it on each change of identity would throw away their state.
    expect(mounts).toBe(1);
  });
});
