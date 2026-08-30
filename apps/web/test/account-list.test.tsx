import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { AccountList } from '@/components/account-list';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const budget = {
  id: 'b1',
  name: 'Household',
  currency: 'USD',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

let answer: {
  accounts: { id: string; name: string; type: string; balance: string }[];
  total: string;
} = {
  accounts: [],
  total: '0',
};

let readFails = false;

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
    queryFn: () =>
      readFails ? Promise.reject(new Error('the network was unkind')) : Promise.resolve(answer),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
  budgetViewControllerReadQueryKey: () => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api' },
  ],
  accountsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerRenameMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
}));

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <AccountList />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  answer = { accounts: [], total: '0' };
  readFails = false;
});

describe('the accounts screen', () => {
  it('draws every account with its type and its balance, and what they hold together', async () => {
    answer = {
      accounts: [
        { id: 'a1', name: 'Wallet', type: 'CASH', balance: '125050' },
        { id: 'a2', name: 'Main card', type: 'DEBIT', balance: '74950' },
      ],
      total: '200000',
    };

    draw();

    expect(await screen.findByText('Wallet')).toBeInTheDocument();
    expect(screen.getByTestId('balance-a1')).toHaveTextContent('1,250.50');
    expect(screen.getByTestId('balance-a2')).toHaveTextContent('749.50');
    expect(screen.getByText(en['newAccount.typeCash'])).toBeInTheDocument();
    expect(screen.getByText(en['newAccount.typeDebit'])).toBeInTheDocument();
    expect(screen.getByTestId('accounts-total')).toHaveTextContent('2,000');
    expect(screen.getByText(en['accounts.total'])).toBeInTheDocument();
  });

  it('reddens an amount below zero, and only that one', async () => {
    answer = {
      accounts: [
        { id: 'a1', name: 'Wallet', type: 'CASH', balance: '-4000' },
        { id: 'a2', name: 'Main card', type: 'DEBIT', balance: '1000' },
      ],
      total: '-3000',
    };

    draw();

    expect(await screen.findByTestId('balance-a1')).toHaveClass('text-destructive');
    expect(screen.getByTestId('balance-a2')).not.toHaveClass('text-destructive');
    expect(screen.getByTestId('accounts-total')).toHaveClass('text-destructive');
  });

  it('invites a budget with no accounts to add one, rather than showing a bare zero', async () => {
    draw();

    expect(await screen.findByText(en['accounts.empty'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['accounts.add'] })).toBeInTheDocument();
  });

  it('says the accounts could not be read instead of drawing a total of nothing', async () => {
    readFails = true;

    draw();

    expect(await screen.findByRole('alert')).toHaveTextContent(en['accounts.unavailable']);
    expect(screen.queryByTestId('accounts-total')).not.toBeInTheDocument();
  });
});
