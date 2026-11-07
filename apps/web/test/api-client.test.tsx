import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

import { ApiProvider } from '@/lib/api';

const mockGetToken = jest.fn();
const mockConfigureApiClient = jest.fn();
let mockUserId: string | null = 'user_a';

jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: mockGetToken, userId: mockUserId, isLoaded: true }),
}));

jest.mock('@rondo/api-client', () => ({
  configureApiClient: (options: unknown) => mockConfigureApiClient(options) as unknown,
}));

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

    expect(configuration().baseUrl).toBe('http://localhost:3000');
    expect(screen.getByText('screen')).toBeInTheDocument();
  });

  it('hands over a token reader rather than a token, so each request gets a fresh one', async () => {
    render(
      <ApiProvider>
        <p>screen</p>
      </ApiProvider>,
    );

    expect(mockGetToken).not.toHaveBeenCalled();

    await expect(configuration().getToken()).resolves.toBe('session.token');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it("does not serve a mounted screen the previous user's cached response", async () => {
    function Screen() {
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

    expect(mounts).toBe(1);
  });

  describe('a read the API refused', () => {
    function Screen({ read }: { read: () => Promise<string> }) {
      const { status } = useQuery({ queryKey: ['refused'], queryFn: read });
      return <p>{`read:${status}`}</p>;
    }

    it.each([
      ['401, which a repeat cannot fix', 401],
      ['429, which a repeat only prolongs', 429],
    ])('is not repeated after a %s', async (_case, statusCode) => {
      const read = jest.fn(() => Promise.reject({ statusCode, message: 'refused' }));

      render(
        <ApiProvider>
          <Screen read={read} />
        </ApiProvider>,
      );

      expect(await screen.findByText('read:error')).toBeInTheDocument();
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('is repeated after a failure a repeat may fix, as before', async () => {
      const read = jest.fn(() => Promise.reject({ statusCode: 503, message: 'down' }));

      render(
        <ApiProvider>
          <Screen read={read} />
        </ApiProvider>,
      );

      await waitFor(() => expect(read).toHaveBeenCalledTimes(2), { timeout: 3000 });
    });
  });
});
