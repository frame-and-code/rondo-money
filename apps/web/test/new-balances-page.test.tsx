import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import NewBalancesPage from '@/app/new/balances/page';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  accountsControllerCorrectOpeningMutation: () => ({ mutationFn: async () => ({}) }),
  accountsControllerListOptions: () => ({
    queryKey: ['accountsControllerList'],
    queryFn: () => Promise.resolve({ accounts: [], total: '0' }),
  }),
  accountsControllerListQueryKey: () => ['accountsControllerList'],
  budgetViewControllerReadQueryKey: () => ['budgetViewControllerRead'],
  transactionsControllerListQueryKey: () => ['transactionsControllerList'],
  netWorthControllerReadQueryKey: () => ['netWorthControllerRead'],
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: () =>
      Promise.resolve([{ id: 'budget-1', currency: 'USD', minorDigits: 2, active: true }]),
  }),
}));

describe('the /new/balances page', () => {
  it('renders the opening balances form', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <NewBalancesPage />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: en['balances.heading'] }),
    ).toBeInTheDocument();
  });
});
