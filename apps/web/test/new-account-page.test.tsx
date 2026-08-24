import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import NewAccountPage from '@/app/new/account/page';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  accountsControllerCreateMutation: () => ({ mutationFn: async () => ({ id: 'account-1' }) }),
  accountsControllerListQueryKey: () => ['accountsControllerList'],
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: () =>
      Promise.resolve([{ id: 'budget-1', currency: 'USD', minorDigits: 2, active: true }]),
  }),
}));

describe('the /new/account page', () => {
  it('renders the first account form', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <NewAccountPage />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: en['newAccount.heading'] }),
    ).toBeInTheDocument();
  });
});
