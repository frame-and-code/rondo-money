import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import HomePage from '@/app/page';
import { LocaleProvider } from '@/i18n/locale-context';

const mockQueryFn = jest.fn();
const signedIn = { isLoaded: true, isSignedIn: true, getToken: () => Promise.resolve('token') };
let mockAuth: typeof signedIn = signedIn;

jest.mock('@clerk/nextjs', () => ({
  UserButton: () => null,
  useAuth: () => mockAuth,
}));

jest.mock('@rondo/api-client/react-query', () => ({
  meControllerIdentifyOptions: () => ({ queryKey: ['me'], queryFn: mockQueryFn }),
}));

const renderHome = () => {
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
    expect(mockQueryFn).not.toHaveBeenCalled();
  });

  it('says so instead of staying blank when the API does not answer', async () => {
    mockQueryFn.mockRejectedValue(new Error('503'));
    renderHome();

    expect(await screen.findByText('the API did not answer')).toBeInTheDocument();
  });
});
