import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const answer = {
  accounts: [{ id: 'a1', name: 'Wallet', type: 'CASH', balance: '125050' }],
  total: '125050',
};

const create = jest.fn();
const rename = jest.fn();
const invalidate = jest.fn();

let renameRefuses: unknown = null;
let holdCreate = false;
let heldCreate: ((reason: unknown) => void) | null = null;

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve(answer),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
  budgetViewControllerReadQueryKey: () => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api' },
  ],
  accountsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => {
      create(options);

      return holdCreate
        ? new Promise((_resolve, reject) => {
            heldCreate = reject;
          })
        : Promise.resolve({ id: 'a2', name: 'Savings', type: 'CASH' });
    },
  }),
  accountsControllerRenameMutation: () => ({
    mutationFn: (options: unknown) => {
      rename(options);

      return renameRefuses === null
        ? Promise.resolve({ id: 'a1', name: 'Cash', type: 'CASH' })
        : Promise.reject(renameRefuses);
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
        <AccountList />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const bodyOf = (call: jest.Mock, index: number): Record<string, unknown> => {
  const options = call.mock.calls[index]?.[0] as { body?: Record<string, unknown> } | undefined;

  return options?.body ?? {};
};

const openCreate = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('Wallet');
  await user.click(screen.getByRole('button', { name: en['accounts.add'] }));
};

const openRename = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('Wallet');
  await user.click(
    screen.getByRole('button', { name: en['accounts.renameOne'].replace('{{name}}', 'Wallet') }),
  );
};

afterEach(() => {
  jest.clearAllMocks();
  renameRefuses = null;
  holdCreate = false;
  heldCreate = null;
});

describe('adding an account from the screen', () => {
  it('sends the name, the type and the amount in minor units under one key', async () => {
    const user = userEvent.setup();
    draw();

    await openCreate(user);
    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Savings');
    await user.type(screen.getByLabelText(en['newAccount.balanceLabel']), '1,250.50');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(bodyOf(create, 0)).toMatchObject({
      name: 'Savings',
      type: 'DEBIT',
      initialBalance: '125050',
    });
    expect(typeof bodyOf(create, 0)['idempotencyKey']).toBe('string');
  });

  it('does not send an expression nobody has finished typing', async () => {
    const user = userEvent.setup();
    draw();

    await openCreate(user);
    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Savings');
    await user.type(screen.getByLabelText(en['newAccount.balanceLabel']), '10+');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    expect(create).not.toHaveBeenCalled();
  });

  it('invalidates the accounts and the month, because the opening balance moves ready to assign', async () => {
    const user = userEvent.setup();
    draw();

    await openCreate(user);
    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Savings');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));

    const keys = invalidate.mock.calls.map((call) =>
      JSON.stringify((call[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys.some((key) => key.includes('accountsControllerList'))).toBe(true);
    expect(keys.some((key) => key.includes('budgetViewControllerRead'))).toBe(true);
  });
});

describe('a failure that lands after the dialog was dismissed', () => {
  it('does not carry a failure from a dialog nobody has open into the next one', async () => {
    const user = userEvent.setup();
    holdCreate = true;
    draw();

    await openCreate(user);
    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Savings');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByLabelText(en['newAccount.nameLabel'])).not.toBeInTheDocument(),
    );

    await act(async () => {
      heldCreate?.('the network was unkind');
    });

    await user.click(screen.getByRole('button', { name: en['accounts.add'] }));

    expect(await screen.findByLabelText(en['newAccount.nameLabel'])).toBeInTheDocument();
    expect(screen.queryByText(en['accounts.saveFailed'])).not.toBeInTheDocument();
  });
});

describe('renaming an account from the screen', () => {
  it('sends the name and the key, and never the type', async () => {
    const user = userEvent.setup();
    draw();

    await openRename(user);

    const field = await screen.findByLabelText(en['newAccount.nameLabel']);
    await user.clear(field);
    await user.type(field, 'Cash');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));

    const options = rename.mock.calls[0]?.[0] as { path?: unknown; body?: Record<string, unknown> };
    expect(options.path).toEqual({ id: 'a1' });
    expect(Object.keys(bodyOf(rename, 0)).sort()).toEqual(['idempotencyKey', 'name']);
    expect(bodyOf(rename, 0)['name']).toBe('Cash');
  });

  it('carries one key across two attempts at the same intent', async () => {
    const user = userEvent.setup();
    renameRefuses = new Error('the network was unkind');
    draw();

    await openRename(user);

    const field = await screen.findByLabelText(en['newAccount.nameLabel']);
    await user.clear(field);
    await user.type(field, 'Cash');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    expect(await screen.findByText(en['accounts.saveFailed'])).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(rename).toHaveBeenCalledTimes(2));
    expect(bodyOf(rename, 1)['idempotencyKey']).toBe(bodyOf(rename, 0)['idempotencyKey']);
  });

  it('keeps the dialog open on a refusal and mints a new key once the name changes', async () => {
    const user = userEvent.setup();
    renameRefuses = { statusCode: 400, message: 'This budget holds no account a1.' };
    draw();

    await openRename(user);

    const field = await screen.findByLabelText(en['newAccount.nameLabel']);
    await user.clear(field);
    await user.type(field, 'Cash');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    expect(await screen.findByText(en['accounts.saveFailed'])).toBeInTheDocument();

    await user.type(screen.getByLabelText(en['newAccount.nameLabel']), ' at home');
    await user.click(screen.getByRole('button', { name: en['accounts.save'] }));

    await waitFor(() => expect(rename).toHaveBeenCalledTimes(2));
    expect(bodyOf(rename, 1)['idempotencyKey']).not.toBe(bodyOf(rename, 0)['idempotencyKey']);
  });
});
