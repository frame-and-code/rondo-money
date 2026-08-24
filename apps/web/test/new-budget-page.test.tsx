import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import NewBudgetPage from '@/app/new/page';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerCreateMutation: () => ({ mutationFn: async () => ({ id: 'budget-1' }) }),
  budgetsControllerListQueryKey: () => ['budgetsControllerList'],
}));

describe('the /new page', () => {
  it('renders the budget form', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <NewBudgetPage />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: en['newBudget.heading'] })).toBeInTheDocument();
  });
});
