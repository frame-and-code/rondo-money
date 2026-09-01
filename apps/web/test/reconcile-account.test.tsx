import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MoneyFlow } from '@/components/money-flow';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

let budget = {
  id: 'b1',
  name: 'Household',
  currency: 'USD',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

const WALLET = {
  id: 'a1',
  name: 'Wallet',
  type: 'CASH',
  balance: '125050',
  openingEditable: true,
};

const SECOND = {
  id: 'a2',
  name: 'Old card',
  type: 'DEBIT',
  balance: '0',
  openingEditable: true,
};

const OWING = {
  id: 'a3',
  name: 'Overdrawn',
  type: 'DEBIT',
  balance: '-4500',
  openingEditable: true,
};

const reconcile = jest.fn();
const invalidate = jest.fn();

let reconcileRefuses: unknown = null;
jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ accounts: [WALLET, SECOND, OWING], total: WALLET.balance }),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
  budgetViewControllerReadOptions: () => ({
    queryKey: [{ _id: 'budgetViewControllerRead', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ month: '2026-08', readyToAssign: '0', groups: [] }),
  }),
  budgetViewControllerReadQueryKey: () => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api' },
  ],
  transactionsControllerPayeesOptions: () => ({
    queryKey: [{ _id: 'transactionsControllerPayees', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ payees: [] }),
  }),
  transactionsControllerPayeesQueryKey: () => [
    { _id: 'transactionsControllerPayees', baseUrl: 'http://api' },
  ],
  transactionsControllerListInfiniteOptions: () => ({
    queryKey: [{ _id: 'transactionsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ transactions: [], days: [], nextCursor: null }),
  }),
  transactionsControllerListQueryKey: () => [
    { _id: 'transactionsControllerList', baseUrl: 'http://api' },
  ],
  transactionsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transactionsControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transactionsControllerRemoveMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transfersControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transfersControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transfersControllerRemoveMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerCorrectOpeningMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerRenameMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerArchiveMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerReconcileMutation: () => ({
    mutationFn: (options: unknown) => {
      reconcile(options);

      return reconcileRefuses === null
        ? Promise.resolve({ difference: '24950', adjustmentId: 't1' })
        : Promise.reject(reconcileRefuses);
    },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));

const draw = (on: string | null = null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <MoneyFlow accountId={on} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const openReconcile = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByTestId('account-panel');
  await user.click(await screen.findByRole('button', { name: en['accounts.reconcile'] }));
};

const surface = () => within(screen.getByRole('dialog'));

const field = () => screen.getByLabelText(en['accounts.reconcileLabel']);

const confirm = () => screen.getByRole('button', { name: en['accounts.reconcileConfirm'] });

const bodyOf = (index: number): Record<string, unknown> => {
  const options = reconcile.mock.calls[index]?.[0] as
    { body?: Record<string, unknown> } | undefined;

  return options?.body ?? {};
};

const said = (key: 'accounts.reconcileWillWrite', amount: string): string =>
  en[key].replace('{{amount}}', amount);

afterEach(() => {
  jest.clearAllMocks();
  reconcileRefuses = null;
  budget = { ...budget, currency: 'USD', minorDigits: 2 };
});

describe('reconciling an account with what it really holds', () => {
  it('offers no reconciliation while the feed covers every account, because there is none to settle', async () => {
    draw();

    await screen.findByTestId('account-panel');

    expect(
      screen.queryByRole('button', { name: en['accounts.reconcile'] }),
    ).not.toBeInTheDocument();
  });

  it('offers the reconciliation beside the filters once the feed is on one account', async () => {
    draw('a1');

    await screen.findByTestId('account-panel');

    expect(screen.getByRole('button', { name: en['accounts.reconcile'] })).toBeInTheDocument();
  });

  it('shows what the book says and what the correction would come to, before anything is written', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1,500.00');

    expect(surface().getByText(en['accounts.reconcileComputed'])).toBeInTheDocument();
    expect(surface().getByText('1,250.50 $')).toBeInTheDocument();
    expect(
      surface().getByText(said('accounts.reconcileWillWrite', '249.50 $')),
    ).toBeInTheDocument();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('says that balances which already agree write nothing, and still takes the answer', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1250.50');

    expect(surface().getByText(en['accounts.reconcileNoDifference'])).toBeInTheDocument();

    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ balance: '125050' });
  });

  it('takes a balance below zero, because an account can be spent past its own money', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '-45');

    expect(
      surface().getByText(said('accounts.reconcileWillWrite', '-1,295.50 $')),
    ).toBeInTheDocument();

    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ balance: '-4500' });
  });

  it('writes nothing from an empty field, even though the endpoint takes zero', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.click(confirm());

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('shows an unfinished expression as an amount and refuses to write it', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1250.50+');

    expect(surface().getByText(en['accounts.reconcileNoDifference'])).toBeInTheDocument();

    await user.click(confirm());

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('renders every amount under a currency that carries no minor digits', async () => {
    const user = userEvent.setup();
    budget = { ...budget, currency: 'JPY', minorDigits: 0 };
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '2000');

    expect(surface().getByText('125,050 ¥')).toBeInTheDocument();
    expect(
      surface().getByText(said('accounts.reconcileWillWrite', '-123,050 ¥')),
    ).toBeInTheDocument();
  });

  it('reddens a balance the book puts below zero and leaves the correction plain', async () => {
    const user = userEvent.setup();
    draw('a3');

    await openReconcile(user);

    expect(surface().getByText('-45 $')).toHaveClass('text-destructive');

    await user.type(field(), '-100');

    expect(surface().getByText(said('accounts.reconcileWillWrite', '-55 $'))).not.toHaveClass(
      'text-destructive',
    );
  });

  it('carries no field for the day, because a reconciliation happens today', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);

    expect(screen.queryByLabelText(en['transactions.dateLabel'])).not.toBeInTheDocument();
  });

  it('mints one key per opening and a new one after the money moved', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));

    await openReconcile(user);
    await user.type(field(), '1600');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
  });

  it('keeps the key and freezes the field when the answer never arrived', async () => {
    const user = userEvent.setup();
    reconcileRefuses = new Error('the network was unkind');
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(field()).toBeDisabled());

    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)['idempotencyKey']).toBe(bodyOf(0)['idempotencyKey']);
  });

  it('mints a new key once the server has refused the old one and the amount is edited', async () => {
    const user = userEvent.setup();
    reconcileRefuses = { statusCode: 400, reason: 'ACCOUNT_ARCHIVED' };
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));

    await user.type(field(), '0');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
  });

  it('re-reads everything when a request nobody retried is thrown away', async () => {
    const user = userEvent.setup();
    reconcileRefuses = new Error('the network was unkind');
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: en['accounts.cancel'] }));

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('re-reads the accounts, the month and the feed, because a correction moves all three', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    const keys = invalidate.mock.calls.map((call) =>
      JSON.stringify((call[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys.some((key) => key.includes('accountsControllerList'))).toBe(true);
    expect(keys.some((key) => key.includes('budgetViewControllerRead'))).toBe(true);
    expect(keys.some((key) => key.includes('transactionsControllerList'))).toBe(true);
  });

  it('walks away without writing anything', async () => {
    const user = userEvent.setup();
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(screen.getByRole('button', { name: en['accounts.cancel'] }));

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('says what the server refused, rather than failing in silence', async () => {
    const user = userEvent.setup();
    reconcileRefuses = { statusCode: 400, reason: 'ACCOUNT_ARCHIVED' };
    draw('a1');

    await openReconcile(user);
    await user.type(field(), '1500');
    await user.click(confirm());

    expect(await screen.findByText(en['accounts.failArchived'])).toBeInTheDocument();
  });
});
