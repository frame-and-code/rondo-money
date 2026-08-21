import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
});
