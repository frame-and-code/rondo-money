import { todayIn } from '@rondo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewEntryDialog } from '@/components/new-entry-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const written: unknown[] = [];
const transferred: unknown[] = [];
const onClose = jest.fn();

let releaseAccounts: (() => void) | null = null;
let holdAccounts = false;
let failAccounts = false;
let releaseWrite: (() => void) | null = null;
let holdWrite = false;

const budget = {
  id: 'b1',
  name: 'Household',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

const accounts = {
  accounts: [
    { id: 'a1', name: 'Card', type: 'DEBIT', balance: '100000', openingEditable: false },
    { id: 'a2', name: 'Cash', type: 'CASH', balance: '20000', openingEditable: false },
  ],
  total: '120000',
};

const view = {
  month: '2026-08',
  readyToAssign: '0',
  groups: [
    {
      id: 'g1',
      name: 'Everyday',
      hidden: false,
      categories: [
        {
          id: 'c1',
          name: 'Groceries',
          icon: null,
          color: null,
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: false,
          paid: false,
          target: null,
          defaultAccountId: 'a2',
        },
        {
          id: 'c3',
          name: 'Old habit',
          icon: null,
          color: null,
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: true,
          paid: false,
          target: null,
          defaultAccountId: null,
        },
        {
          id: 'c2',
          name: 'Pharmacy',
          icon: null,
          color: null,
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: false,
          paid: false,
          target: null,
          defaultAccountId: null,
        },
      ],
    },
  ],
};

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList' }],
    queryFn: () =>
      failAccounts
        ? Promise.reject(new Error('the accounts could not be read'))
        : holdAccounts
          ? new Promise((resolve) => {
              releaseAccounts = () => resolve(accounts);
            })
          : Promise.resolve(accounts),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList' }],
  budgetViewControllerReadOptions: () => ({
    queryKey: [{ _id: 'budgetViewControllerRead' }],
    queryFn: () => Promise.resolve(view),
  }),
  budgetViewControllerReadQueryKey: () => [{ _id: 'budgetViewControllerRead' }],
  transactionsControllerPayeesOptions: () => ({
    queryKey: [{ _id: 'transactionsControllerPayees' }],
    queryFn: () => Promise.resolve({ payees: [] }),
  }),
  transactionsControllerPayeesQueryKey: () => [{ _id: 'transactionsControllerPayees' }],
  transactionsControllerListQueryKey: () => [{ _id: 'transactionsControllerList' }],
  transactionsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => {
      written.push(options);

      return holdWrite
        ? new Promise((resolve) => {
            releaseWrite = () => resolve({});
          })
        : Promise.resolve({});
    },
  }),
  transfersControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => {
      transferred.push(options);

      return Promise.resolve({});
    },
  }),
}));

let client = new QueryClient();

const draw = (prefer: { categoryId: string | null; accountId: string | null }) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <NewEntryDialog prefer={prefer} onClose={onClose} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const theForm = () => screen.findByRole('dialog', { name: en['transactions.createTitle'] });

const field = (form: HTMLElement, label: string) =>
  within(form).getByRole('combobox', { name: label });

beforeEach(() => {
  written.length = 0;
  transferred.length = 0;
  holdAccounts = false;
  releaseAccounts = null;
  failAccounts = false;
  holdWrite = false;
  releaseWrite = null;
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe('the form a transaction is added in from a category', () => {
  it('shows no form until the accounts are read, then opens holding the default account', async () => {
    holdAccounts = true;
    draw({ categoryId: 'c1', accountId: 'a2' });

    await waitFor(() => expect(releaseAccounts).not.toBeNull());
    expect(screen.queryByLabelText(en['transactions.amountLabel'])).not.toBeInTheDocument();

    releaseAccounts?.();
    const form = await theForm();

    expect(field(form, en['transactions.accountLabel'])).toHaveTextContent('Cash');
  });

  it('opens on an expense, with all three kinds, the category and its account', async () => {
    draw({ categoryId: 'c1', accountId: 'a2' });

    const form = await theForm();

    expect(
      within(form).getByRole('heading', { name: en['transactions.createExpense'] }),
    ).toBeVisible();
    for (const kind of [
      en['transactions.kindExpense'],
      en['transactions.kindIncome'],
      en['transactions.kindTransfer'],
    ]) {
      expect(within(form).getByRole('button', { name: kind })).toBeInTheDocument();
    }
    expect(
      within(form).getByRole('button', { name: en['transactions.kindExpense'] }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(field(form, en['transactions.categoryLabel'])).toHaveTextContent('Groceries');
    expect(field(form, en['transactions.accountLabel'])).toHaveTextContent('Cash');
  });

  it('opens on the category it came from and no payee, whatever the last record was', async () => {
    window.localStorage.setItem(
      'rondo.lastEntry:b1',
      JSON.stringify({
        date: null,
        categoryId: 'c2',
        payee: 'Corner cafe',
        storedOn: todayIn(budget.timezone),
      }),
    );
    draw({ categoryId: 'c1', accountId: 'a2' });

    const form = await theForm();

    expect(field(form, en['transactions.categoryLabel'])).toHaveTextContent('Groceries');
    expect(field(form, en['transactions.payeeExpense'])).not.toHaveTextContent('Corner cafe');
  });

  it('starts on no category when the one it came from is hidden today, which nothing new may land in', async () => {
    const user = userEvent.setup();
    draw({ categoryId: 'c3', accountId: null });

    const form = await theForm();
    await user.type(within(form).getByLabelText(en['transactions.amountLabel']), '12');
    await user.click(within(form).getByRole('button', { name: en['transactions.save'] }));

    expect(field(form, en['transactions.categoryLabel'])).toHaveTextContent(
      en['transactions.pickCategory'],
    );
    expect(written).toEqual([]);
  });

  it('takes the first account when the category names none, or one that is not open', async () => {
    const none = draw({ categoryId: 'c1', accountId: null });
    expect(field(await theForm(), en['transactions.accountLabel'])).toHaveTextContent('Card');
    none.unmount();

    draw({ categoryId: 'c1', accountId: '0199c1a8-9ecf-71c7-a617-c575df0739ff' });
    expect(field(await theForm(), en['transactions.accountLabel'])).toHaveTextContent('Card');
  });

  it('keeps the category for an income and writes one', async () => {
    const user = userEvent.setup();
    draw({ categoryId: 'c1', accountId: 'a2' });

    const form = await theForm();
    await user.click(within(form).getByRole('button', { name: en['transactions.kindIncome'] }));
    await user.type(within(form).getByLabelText(en['transactions.amountLabel']), '40');
    await user.click(within(form).getByRole('button', { name: en['transactions.save'] }));

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toMatchObject({
      body: { type: 'INCOME', categoryId: 'c1', accountId: 'a2' },
    });
  });

  it('moves money from the default account in a transfer, and keeps the category for coming back', async () => {
    const user = userEvent.setup();
    draw({ categoryId: 'c1', accountId: 'a2' });

    const form = await theForm();
    await user.click(within(form).getByRole('button', { name: en['transactions.kindTransfer'] }));

    expect(field(form, en['transactions.fromAccountLabel'])).toHaveTextContent('Cash');
    expect(field(form, en['transactions.toAccountLabel'])).toHaveTextContent('Card');

    await user.click(within(form).getByRole('button', { name: en['transactions.kindExpense'] }));
    expect(field(form, en['transactions.categoryLabel'])).toHaveTextContent('Groceries');

    await user.click(within(form).getByRole('button', { name: en['transactions.kindTransfer'] }));
    await user.type(within(form).getByLabelText(en['transactions.amountLabel']), '15');
    await user.click(within(form).getByRole('button', { name: en['transactions.save'] }));

    await waitFor(() => expect(transferred).toHaveLength(1));
    expect(transferred[0]).toMatchObject({ body: { fromAccountId: 'a2', toAccountId: 'a1' } });
  });

  it('says the form could not be read rather than opening nothing', async () => {
    failAccounts = true;
    draw({ categoryId: 'c1', accountId: 'a2' });

    expect(await screen.findByRole('alert')).toHaveTextContent(en['transactions.unavailable']);
  });

  it('rereads the balances and the feed after a save, even when the form was closed before it landed', async () => {
    const user = userEvent.setup();
    holdWrite = true;
    const view = draw({ categoryId: 'c1', accountId: 'a2' });

    const form = await theForm();
    await user.type(within(form).getByLabelText(en['transactions.amountLabel']), '12');
    await user.click(within(form).getByRole('button', { name: en['transactions.save'] }));
    await waitFor(() => expect(releaseWrite).not.toBeNull());

    const reread = jest.spyOn(client, 'invalidateQueries');
    view.unmount();
    releaseWrite?.();

    await waitFor(() =>
      expect(reread).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: [{ _id: 'accountsControllerList' }] }),
      ),
    );
  });
});
