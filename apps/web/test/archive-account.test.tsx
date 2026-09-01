import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MoneyFlow } from '@/components/money-flow';
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

const HOLDING = {
  id: 'a1',
  name: 'Wallet',
  type: 'CASH',
  balance: '125050',
  openingEditable: true,
};

const EMPTIED = { id: 'a2', name: 'Old card', type: 'DEBIT', balance: '0', openingEditable: true };

let listed = [HOLDING, EMPTIED];

const archive = jest.fn();
const invalidate = jest.fn();

let archiveRefuses: unknown = null;

const asked: Record<string, unknown>[] = [];

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
    queryFn: () =>
      Promise.resolve({
        accounts: listed,
        total: listed.reduce((sum, one) => sum + BigInt(one.balance), 0n).toString(10),
      }),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
  budgetViewControllerReadOptions: () => ({
    queryKey: [{ _id: 'budgetViewControllerRead', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ month: '2026-08', readyToAssign: '0', groups: [] }),
  }),
  transactionsControllerPayeesOptions: () => ({
    queryKey: [{ _id: 'transactionsControllerPayees', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve({ payees: [] }),
  }),
  transactionsControllerPayeesQueryKey: () => [
    { _id: 'transactionsControllerPayees', baseUrl: 'http://api' },
  ],
  transactionsControllerListInfiniteOptions: (options: { query?: Record<string, unknown> }) => ({
    queryKey: [{ _id: 'transactionsControllerList', baseUrl: 'http://api', ...options.query }],
    queryFn: () => {
      asked.push(options.query ?? {});

      return Promise.resolve({ transactions: [], days: [], nextCursor: null });
    },
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
  budgetViewControllerReadQueryKey: () => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api' },
  ],
  accountsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerCorrectOpeningMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerRenameMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerArchiveMutation: () => ({
    mutationFn: (options: unknown) => {
      archive(options);

      if (archiveRefuses !== null) {
        return Promise.reject(archiveRefuses);
      }

      listed = listed.filter((one) => one.id !== EMPTIED.id);

      return Promise.resolve({ id: EMPTIED.id, name: EMPTIED.name, type: EMPTIED.type });
    },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <MoneyFlow />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const panel = () => within(screen.getByTestId('account-panel'));

const openRename = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await screen.findByTestId('account-panel');

  await user.click(
    await panel().findByRole('button', {
      name: en['accounts.renameOne'].replace('{{name}}', name),
    }),
  );
};

afterEach(() => {
  jest.clearAllMocks();
  listed = [HOLDING, EMPTIED];
  archiveRefuses = null;
  asked.length = 0;
});

describe('archiving an account from the screen', () => {
  it('refuses to offer the archive while the account still holds money, and says why', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user, 'Wallet');

    expect(await screen.findByRole('button', { name: en['accounts.archive'] })).toBeDisabled();
    expect(screen.getByText(en['accounts.archiveNeedsZero'])).toBeInTheDocument();
  });

  it('asks for a confirmation before it archives an emptied account', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));

    expect(screen.getByRole('button', { name: en['accounts.archiveConfirm'] })).toBeInTheDocument();
    expect(screen.getByText(en['accounts.archiveBody'])).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });

  it('archives once when the confirmation is taken, under a key it minted itself', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));
    await user.click(screen.getByRole('button', { name: en['accounts.archiveConfirm'] }));

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));

    const options = archive.mock.calls[0]?.[0] as {
      path?: Record<string, unknown>;
      body?: Record<string, unknown>;
    };
    expect(options.path).toEqual({ id: 'a2' });
    expect(typeof options.body?.['idempotencyKey']).toBe('string');
  });

  it('walks away from the confirmation without archiving anything', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));
    await user.click(screen.getByRole('button', { name: en['accounts.cancel'] }));

    expect(archive).not.toHaveBeenCalled();
  });

  it('takes the feed back to every account when the one it was showing is archived', async () => {
    const user = userEvent.setup();
    draw();

    await screen.findByTestId('account-panel');
    await user.click(await panel().findByRole('button', { name: 'Old card' }));

    await waitFor(() => expect(asked.at(-1)).toMatchObject({ accountId: 'a2' }));

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));
    await user.click(screen.getByRole('button', { name: en['accounts.archiveConfirm'] }));

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(asked.at(-1)).not.toHaveProperty('accountId'));
  });

  it('re-reads the accounts and the month, because a closed account leaves both', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));
    await user.click(screen.getByRole('button', { name: en['accounts.archiveConfirm'] }));

    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    const keys = invalidate.mock.calls.map((call) =>
      JSON.stringify((call[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys.some((key) => key.includes('accountsControllerList'))).toBe(true);
    expect(keys.some((key) => key.includes('budgetViewControllerRead'))).toBe(true);
  });

  it('says what blocked the archive when the server refuses it after all', async () => {
    const user = userEvent.setup();
    archiveRefuses = { statusCode: 400, reason: 'BALANCE_NOT_ZERO', balance: '4000' };
    draw();

    await openRename(user, 'Old card');
    await user.click(await screen.findByRole('button', { name: en['accounts.archive'] }));
    await user.click(screen.getByRole('button', { name: en['accounts.archiveConfirm'] }));

    expect(await screen.findByText(en['accounts.failBalanceNotZero'])).toBeInTheDocument();
  });
});
