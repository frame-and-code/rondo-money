import { todayIn } from '@rondo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';

import { MoneyFlow } from '@/components/money-flow';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

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
    { id: 'a1', name: 'Wallet', type: 'CASH', balance: '125050' },
    { id: 'a2', name: 'Card', type: 'DEBIT', balance: '-4000' },
  ],
  total: '121050',
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
          id: 'c9',
          name: 'Old habit',
          icon: null,
          color: null,
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: true,
          target: null,
        },
        {
          id: 'c1',
          name: 'Coffee',
          icon: null,
          color: null,
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: false,
          target: null,
        },
      ],
    },
  ],
};

const asked: Record<string, unknown>[] = [];

const viewed: Record<string, unknown>[] = [];

const written: unknown[] = [];

let fetched = 0;

const wholeFeed = {
  transactions: [
    {
      id: 'r1',
      accountId: 'a1',
      categoryId: 'c1',
      date: '2020-01-02',
      amount: '-12050',
      type: 'EXPENSE',
      payee: 'Corner cafe',
      isSystem: false,
      transferId: null,
      counterAccountId: null,
      createdAt: '2020-01-02T09:00:00.000Z',
    },
  ],
  days: [{ date: '2020-01-02', total: '-12050' }],
  nextCursor: null,
};

let page: {
  transactions: Record<string, unknown>[];
  days: { date: string; total: string }[];
  nextCursor: string | null;
} = wholeFeed;

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList' }],
    queryFn: () => Promise.resolve(accounts),
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList' }],
  accountsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  accountsControllerRenameMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  budgetViewControllerReadOptions: (options: { query: Record<string, unknown> }) => {
    viewed.push(options.query);

    return {
      queryKey: [{ _id: 'budgetViewControllerRead' }],
      queryFn: () => Promise.resolve(view),
    };
  },
  budgetViewControllerReadQueryKey: () => [{ _id: 'budgetViewControllerRead' }],
  transactionsControllerPayeesOptions: () => ({
    queryKey: [{ _id: 'transactionsControllerPayees' }],
    queryFn: () => Promise.resolve({ payees: ['Corner cafe', 'Pharmacy'] }),
  }),
  transactionsControllerPayeesQueryKey: () => [{ _id: 'transactionsControllerPayees' }],
  transactionsControllerListInfiniteOptions: (options: { query: Record<string, unknown> }) => {
    asked.push(options.query);

    return {
      queryKey: [{ _id: 'transactionsControllerList', query: options.query }],
      queryFn: () => {
        fetched += 1;

        return Promise.resolve(page);
      },
    };
  },
  transactionsControllerListQueryKey: () => [{ _id: 'transactionsControllerList' }],
  transactionsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => {
      written.push(options);

      return Promise.resolve({});
    },
  }),
  transactionsControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  transactionsControllerRemoveMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
}));

class Watcher {
  static live: Watcher[] = [];

  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];

  constructor(private readonly answer: IntersectionObserverCallback) {
    Watcher.live.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  reach(): void {
    this.answer(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

globalThis.IntersectionObserver = Watcher as unknown as typeof IntersectionObserver;

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="en">
        <MoneyFlow />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const lastAsked = (): Record<string, unknown> => asked[asked.length - 1] ?? {};

afterEach(() => {
  page = wholeFeed;
  asked.length = 0;
  viewed.length = 0;
  written.length = 0;
  Watcher.live.length = 0;
  fetched = 0;
});

const dayName = (date: string): RegExp => {
  const [year = '', month = '', day = ''] = date.split('-');

  return new RegExp(
    format(new Date(Number(year), Number(month) - 1, Number(day)), 'MMMM do, yyyy'),
  );
};

const pickCategory = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

const pickType = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByRole('combobox', { name: en['transactions.typeLabel'] }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('the money flow screen', () => {
  it('asks the server for every account until one is picked', async () => {
    draw();

    await screen.findByText('Corner cafe');

    expect(lastAsked()).toEqual({});
  });

  it('asks the server again when an account is picked, rather than narrowing what is loaded', async () => {
    draw();
    await screen.findByText('Wallet');

    await userEvent.click(screen.getByRole('button', { name: 'Wallet' }));

    await waitFor(() => expect(lastAsked()).toMatchObject({ accountId: 'a1' }));
  });

  it('sends two filters as one narrower question', async () => {
    draw();
    await screen.findByText('Corner cafe');

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await pickCategory('Coffee');
    await pickType(en['transactions.typeIncome']);

    await waitFor(() => expect(lastAsked()).toMatchObject({ categoryId: 'c1', type: 'INCOME' }));
  });

  it('counts the filters that are on and clears them all at once', async () => {
    draw();
    await screen.findByText('Corner cafe');

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await pickCategory('Coffee');

    expect(screen.getByTestId('filter-count')).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.reset'] }));

    await waitFor(() => expect(lastAsked()).toEqual({}));
  });

  it('reads a period as a range of days, not a month, and asks from that day on', async () => {
    draw();
    await screen.findByText('Corner cafe');

    const today = todayIn(budget.timezone);

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await userEvent.click(screen.getByRole('button', { name: en['transactions.periodLabel'] }));
    await userEvent.click(await screen.findByRole('button', { name: dayName(today) }));

    await waitFor(() => expect(lastAsked()).toMatchObject({ from: today }));
  });

  it('closes a range on the second day and starts a new one on the next click', async () => {
    draw();
    await screen.findByText('Corner cafe');

    const today = todayIn(budget.timezone);
    const first = `${today.slice(0, 7)}-01`;

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await userEvent.click(screen.getByRole('button', { name: en['transactions.periodLabel'] }));
    await userEvent.click(await screen.findByRole('button', { name: dayName(first) }));
    await userEvent.click(await screen.findByRole('button', { name: dayName(today) }));

    await waitFor(() => expect(lastAsked()).toMatchObject({ from: first, to: today }));

    await userEvent.click(await screen.findByRole('button', { name: dayName(first) }));

    await waitFor(() => expect(lastAsked()).toEqual({ from: first }));
  });

  it('names the envelope the money goes back to when a record is being deleted', async () => {
    draw();
    await screen.findByText('Corner cafe');

    await userEvent.click(
      screen.getByRole('button', {
        name: en['transactions.deleteOne'].replace('{{payee}}', 'Corner cafe'),
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: en['transactions.delete'] }));

    expect(await screen.findByTestId('delete-category-line')).toHaveTextContent('Coffee');
  });

  it('still names an envelope that was hidden after the money left it', async () => {
    page = {
      transactions: [
        {
          id: 'r2',
          accountId: 'a1',
          categoryId: 'c9',
          date: '2020-01-02',
          amount: '-4000',
          type: 'EXPENSE',
          payee: 'Old shop',
          isSystem: false,
          transferId: null,
          counterAccountId: null,
          createdAt: '2020-01-02T09:00:00.000Z',
        },
      ],
      days: [{ date: '2020-01-02', total: '-4000' }],
      nextCursor: null,
    };
    draw();

    expect(await screen.findByText(/Old habit/)).toBeInTheDocument();
    expect(viewed.at(-1)).toMatchObject({ includeHidden: true });
  });

  it('names the hidden envelope a record already sits in when that record is opened', async () => {
    page = {
      transactions: [
        {
          id: 'r2',
          accountId: 'a1',
          categoryId: 'c9',
          date: '2020-01-02',
          amount: '-4000',
          type: 'EXPENSE',
          payee: 'Old shop',
          isSystem: false,
          transferId: null,
          counterAccountId: null,
          createdAt: '2020-01-02T09:00:00.000Z',
        },
      ],
      days: [{ date: '2020-01-02', total: '-4000' }],
      nextCursor: null,
    };
    draw();

    await userEvent.click(await screen.findByRole('button', { name: 'Old shop' }));

    expect(
      await screen.findByRole('combobox', { name: en['transactions.categoryLabel'] }),
    ).toHaveTextContent('Old habit');
  });

  it('keeps a hidden envelope out of the picker, because nothing new goes there', async () => {
    draw();
    await screen.findByText('Corner cafe');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.add'] }));
    await userEvent.click(
      await screen.findByRole('combobox', { name: en['transactions.categoryLabel'] }),
    );

    expect(await screen.findByRole('option', { name: 'Coffee' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Old habit' })).toBeNull();
  });

  it('offers to record today when the feed does not start with it, and opens on today', async () => {
    window.localStorage.setItem(
      'rondo.lastEntry:b1',
      JSON.stringify({
        accountId: 'a1',
        date: '2020-01-02',
        categoryId: 'c1',
        payee: 'Corner cafe',
      }),
    );
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['transactions.addToday'] }));

    const today = todayIn(budget.timezone);
    const [year = '', month = '', day = ''] = today.split('-');
    const spelled = format(new Date(Number(year), Number(month) - 1, Number(day)), 'd MMMM yyyy');

    expect(await screen.findByRole('button', { name: new RegExp(spelled) })).toBeInTheDocument();

    window.localStorage.clear();
  });

  it('says the filter matched nothing, and offers to clear it', async () => {
    page = { transactions: [], days: [], nextCursor: null };
    draw();
    await screen.findByText('Wallet');

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await pickCategory('Coffee');

    expect(await screen.findByText(en['transactions.emptyFiltered'])).toBeInTheDocument();
  });

  it('keeps the form open after saving and adding another, which is what the button is for', async () => {
    page = {
      transactions: [],
      days: [],
      nextCursor: null,
    };
    draw();
    await screen.findByText('Wallet');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.add'] }));
    await userEvent.type(screen.getByLabelText(en['transactions.amountLabel']), '100');
    await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
    await userEvent.click(await screen.findByRole('option', { name: 'Coffee' }));
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));

    await waitFor(() => expect(written).toHaveLength(1));

    expect(
      await screen.findByRole('button', { name: en['transactions.saveAndMore'] }),
    ).toBeInTheDocument();
  });

  it('closes the form on a plain save', async () => {
    page = { transactions: [], days: [], nextCursor: null };
    draw();
    await screen.findByText('Wallet');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.add'] }));
    await userEvent.type(screen.getByLabelText(en['transactions.amountLabel']), '100');
    await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
    await userEvent.click(await screen.findByRole('option', { name: 'Coffee' }));
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    await waitFor(() => expect(written).toHaveLength(1));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: en['transactions.saveAndMore'] }),
      ).not.toBeInTheDocument(),
    );
  });

  it('asks for the next page when the end of the feed comes into view, without a button', async () => {
    page = {
      transactions: [
        {
          id: 'r1',
          accountId: 'a1',
          categoryId: 'c1',
          date: '2020-01-02',
          amount: '-12050',
          type: 'EXPENSE',
          payee: 'Corner cafe',
          isSystem: false,
          transferId: null,
          counterAccountId: null,
          createdAt: '2020-01-02T09:00:00.000Z',
        },
      ],
      days: [{ date: '2020-01-02', total: '-12050' }],
      nextCursor: 'the-next-page',
    };

    draw();
    await screen.findByTestId('feed-edge');

    expect(screen.queryByRole('button', { name: en['transactions.loadingMore'] })).toBeNull();

    await waitFor(() => expect(fetched).toBe(1));

    const watched = Watcher.live.at(-1);
    act(() => watched?.reach());

    await waitFor(() => expect(fetched).toBe(2));
  });
});

describe('what a reopened form remembers', () => {
  it('opens with an empty amount after the form was closed', async () => {
    page = { transactions: [], days: [], nextCursor: null };
    draw();
    await screen.findByText('Wallet');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.add'] }));
    await userEvent.type(screen.getByLabelText(en['transactions.amountLabel']), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByLabelText(en['transactions.amountLabel'])).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: en['transactions.add'] }));

    expect(await screen.findByLabelText(en['transactions.amountLabel'])).toHaveValue('');
  });
});
