import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import HomePage from '@/app/page';
import { LocaleProvider } from '@/i18n/locale-context';

// Smoke test (F0.5 DoD): the start page renders. Asserts the app heading and that the
// env-driven API base URL is surfaced — the two things F0.5 actually wires up — plus, since
// F1.4, that what the API answered reaches the screen through the generated query options.
// `LocaleProvider` is required (F0.7): `HomePage` reads strings via `useTranslations()`.

const mockQueryFn = jest.fn();
const signedIn = { isLoaded: true, isSignedIn: true, getToken: () => Promise.resolve('token') };
let mockAuth: typeof signedIn = signedIn;

jest.mock('@clerk/nextjs', () => ({
  UserButton: () => null,
  useAuth: () => mockAuth,
}));

// The request function and its auth behaviour are exercised in @rondo/api-client's own suite;
// here only the page's use of the query options is under test.
jest.mock('@rondo/api-client/react-query', () => ({
  meControllerIdentifyOptions: () => ({ queryKey: ['me'], queryFn: mockQueryFn }),
}));

const renderHome = () => {
  // retry: false so a failing query settles immediately instead of backing off past the test.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <HomePage />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

describe('start page', () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockQueryFn.mockResolvedValue({ userId: 'user_2rondoTest' });
    mockAuth = signedIn;
  });

  it('renders the app heading', async () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Rondo Money' })).toBeInTheDocument();
    // The page fetches on mount, so every test waits for that to settle — otherwise the state
    // update lands after the test ends, outside `act()`.
    await screen.findByText('user_2rondoTest');
  });

  it('shows the configured API base URL', async () => {
    renderHome();
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();
    await screen.findByText('user_2rondoTest');
  });

  it('shows the caller the API reported, through the generated query options', async () => {
    renderHome();

    expect(await screen.findByText('user_2rondoTest')).toBeInTheDocument();
    expect(mockQueryFn).toHaveBeenCalled();
  });

  it('names the signed-out state instead of spinning on a request it never makes', async () => {
    mockAuth = { isLoaded: true, isSignedIn: false, getToken: () => Promise.resolve('token') };

    renderHome();

    expect(await screen.findByText('you are not signed in')).toBeInTheDocument();
    // The query is disabled, so there is nothing to wait for — the old code showed the loading
    // label here, forever.
    expect(mockQueryFn).not.toHaveBeenCalled();
  });

  it('says so instead of staying blank when the API does not answer', async () => {
    mockQueryFn.mockRejectedValue(new Error('503'));
    renderHome();

    expect(await screen.findByText('the API did not answer')).toBeInTheDocument();
  });
});
