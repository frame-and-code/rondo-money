import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BalancesForm } from '@/components/balances-form';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

interface ListedAccount {
  id: string;
  name: string;
  type: 'CASH' | 'DEBIT';
  balance: string;
  openingEditable: boolean;
}

interface Correction {
  path: { id: string };
  body: { amount: string; idempotencyKey: string };
}

const BASE = 'http://api';

let budget: { id: string; currency: string; minorDigits: number; active: boolean } = {
  id: 'budget-1',
  currency: 'PLN',
  minorDigits: 2,
  active: true,
};
let accounts: ListedAccount[] = [];
let listGate: Promise<void> | null = null;
let listFails = false;

const correct = jest.fn<Promise<unknown>, [Correction]>();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replace(href) as unknown }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  accountsControllerListOptions: () => ({
    queryKey: [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
    queryFn: async () => {
      if (listGate !== null) await listGate;
      if (listFails) throw new Error('the api was unreachable');

      return { accounts: accounts.map((each) => ({ ...each })), total: '0' };
    },
  }),
  accountsControllerListQueryKey: () => [{ _id: 'accountsControllerList', baseUrl: 'http://api' }],
  budgetViewControllerReadQueryKey: (options: object) => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api', ...options },
  ],
  transactionsControllerListQueryKey: () => [
    { _id: 'transactionsControllerList', baseUrl: 'http://api' },
  ],
  netWorthControllerReadQueryKey: () => [{ _id: 'netWorthControllerRead', baseUrl: 'http://api' }],
  accountsControllerCorrectOpeningMutation: () => ({
    mutationFn: (options: Correction) => correct(options),
  }),
}));

const account = (over: Partial<ListedAccount>): ListedAccount => ({
  id: 'account-1',
  name: 'Карта',
  type: 'DEBIT',
  balance: '0',
  openingEditable: true,
  ...over,
});

let client: QueryClient;

const draw = () => {
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ru">
        <BalancesForm />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const done = () => screen.getByRole('button', { name: ru['balances.submit'] });
const field = (name: string) => screen.findByLabelText(name);

const sentFor = (id: string): Correction[] =>
  correct.mock.calls.map(([call]) => call).filter((call) => call.path.id === id);

const lost = () => new Error('the network was unkind');
const refused = (statusCode: number) => Object.assign(new Error('refused'), { statusCode });

describe('the opening balances of a copied budget', () => {
  beforeEach(() => {
    budget = { id: 'budget-1', currency: 'PLN', minorDigits: 2, active: true };
    accounts = [
      account({ id: 'account-1', name: 'Карта' }),
      account({ id: 'account-2', name: 'Наличные', type: 'CASH' }),
    ];
    listGate = null;
    listFails = false;
    correct.mockReset();
    correct.mockResolvedValue({});
    replace.mockReset();
  });

  it('says what the step is for and that it is the second one of a copy', async () => {
    draw();

    expect(
      await screen.findByRole('heading', { name: ru['balances.heading'] }),
    ).toBeInTheDocument();
    expect(screen.getByText(ru['balances.lead'])).toBeInTheDocument();
    expect(
      screen.getByText(interpolate(ru['onboarding.progress'], { step: 2 })),
    ).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step2BodyCopy'])).toBeInTheDocument();
  });

  it('gives every account a field named after it, empty while it holds nothing', async () => {
    draw();

    expect(await field('Карта')).toHaveValue('');
    expect(await field('Наличные')).toHaveValue('');
  });

  it('fills a field with what the account already holds', async () => {
    accounts = [account({ id: 'account-1', name: 'Карта', balance: '25000' })];
    draw();

    expect(await field('Карта')).toHaveValue('250,00');
  });

  it('shows an account whose opening can no longer change without a field, and never sends it', async () => {
    const user = userEvent.setup();
    accounts = [
      account({ id: 'account-1', name: 'Карта' }),
      account({ id: 'account-9', name: 'Старый', balance: '4200', openingEditable: false }),
    ];
    draw();

    await user.type(await field('Карта'), '10');
    expect(screen.getByText('Старый')).toBeInTheDocument();
    expect(screen.queryByLabelText('Старый')).not.toBeInTheDocument();

    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(sentFor('account-9')).toEqual([]);
  });

  it('keeps the button closed until the accounts have arrived', async () => {
    let release: () => void = () => {};
    listGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    draw();

    expect(await screen.findByRole('button', { name: ru['balances.submit'] })).toBeDisabled();

    await act(async () => {
      release();
      await listGate;
    });

    await field('Карта');
    expect(done()).toBeEnabled();
  });

  it('says the accounts could not be read, and offers nothing to write', async () => {
    listFails = true;
    draw();

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['onboarding.unavailable']);
    expect(screen.queryByLabelText('Карта')).not.toBeInTheDocument();
  });

  it('writes nothing and opens the categories when nothing was typed', async () => {
    const user = userEvent.setup();
    draw();
    await field('Карта');

    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(correct).not.toHaveBeenCalled();
  });

  it('sends one correction per account that was given an amount, in minor units, and then opens the categories', async () => {
    const user = userEvent.setup();
    draw();

    await user.type(await field('Карта'), '1 234,50');
    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(sentFor('account-1')[0]?.body.amount).toBe('123450');
    expect(sentFor('account-2')).toEqual([]);
  });

  it('reads the amount at the digit count of the budget, not of a guess', async () => {
    const user = userEvent.setup();
    budget = { id: 'budget-1', currency: 'JPY', minorDigits: 0, active: true };
    draw();

    await user.type(await field('Карта'), '5000');
    await user.click(done());

    await waitFor(() => expect(correct).toHaveBeenCalledTimes(1));
    expect(sentFor('account-1')[0]?.body.amount).toBe('5000');
  });

  it('sends a zero typed over money the account holds, and nothing for a field that was emptied', async () => {
    const user = userEvent.setup();
    accounts = [
      account({ id: 'account-1', name: 'Карта', balance: '25000' }),
      account({ id: 'account-2', name: 'Наличные', balance: '9000' }),
    ];
    draw();

    const card = await field('Карта');
    await user.clear(card);
    await user.type(card, '0');
    await user.clear(await field('Наличные'));
    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(sentFor('account-1').map((call) => call.body.amount)).toEqual(['0']);
    expect(sentFor('account-2')).toEqual([]);
  });

  it('closes the button on a negative amount and on one nobody finished typing', async () => {
    const user = userEvent.setup();
    draw();
    const card = await field('Карта');

    await user.type(card, '-5');
    expect(done()).toBeDisabled();

    await user.clear(card);
    await user.type(card, '434+');
    expect(done()).toBeDisabled();

    await user.type(card, '6');
    expect(done()).toBeEnabled();
  });

  it('sends each account once however often the button is pressed while it is on its way', async () => {
    const user = userEvent.setup();
    correct.mockReturnValue(new Promise(() => {}));
    draw();

    await user.type(await field('Карта'), '10');
    await user.type(await field('Наличные'), '20');
    await user.click(done());
    await user.click(done());

    await waitFor(() => expect(correct).toHaveBeenCalledTimes(2));
    expect(done()).toBeDisabled();
    expect(await field('Карта')).toBeDisabled();
  });

  it('keeps the screen after a partial failure, and sends again only what did not land', async () => {
    const user = userEvent.setup();
    correct.mockImplementation(({ path, body }) => {
      if (path.id === 'account-2' && correct.mock.calls.length <= 2) {
        return Promise.reject(lost());
      }
      accounts = accounts.map((each) =>
        each.id === path.id ? { ...each, balance: body.amount } : each,
      );

      return Promise.resolve({});
    });
    draw();

    await user.type(await field('Карта'), '10');
    await user.type(await field('Наличные'), '20');
    await user.click(done());

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['balances.failed']);
    expect(replace).not.toHaveBeenCalled();
    expect(await field('Наличные')).toHaveValue('20');

    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(sentFor('account-1')).toHaveLength(1);
    expect(sentFor('account-2')).toHaveLength(2);
  });

  it('retries a lost request under its own key, and a recorded refusal under a new one', async () => {
    const user = userEvent.setup();
    correct.mockRejectedValueOnce(lost()).mockRejectedValueOnce(refused(409)).mockResolvedValue({});
    accounts = [account({ id: 'account-1', name: 'Карта' })];
    draw();

    await user.type(await field('Карта'), '10');
    await user.click(done());
    await screen.findByRole('alert');
    await user.click(done());
    await waitFor(() => expect(correct).toHaveBeenCalledTimes(2));
    await user.click(done());

    await waitFor(() => expect(correct).toHaveBeenCalledTimes(3));
    const keys = sentFor('account-1').map((call) => call.body.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('sends an amount changed after a lost request under a new key', async () => {
    const user = userEvent.setup();
    correct.mockRejectedValueOnce(lost()).mockResolvedValue({});
    accounts = [account({ id: 'account-1', name: 'Карта' })];
    draw();

    const card = await field('Карта');
    await user.type(card, '10');
    await user.click(done());
    await screen.findByRole('alert');

    await user.type(card, '5');
    await user.click(done());

    await waitFor(() => expect(correct).toHaveBeenCalledTimes(2));
    const sent = sentFor('account-1');
    expect(sent.map((call) => call.body.amount)).toEqual(['1000', '10500']);
    expect(sent[1]?.body.idempotencyKey).not.toBe(sent[0]?.body.idempotencyKey);
  });

  it('re-reads the accounts, the month, the records and net worth before it leaves', async () => {
    const user = userEvent.setup();
    draw();
    const month = [{ _id: 'budgetViewControllerRead', baseUrl: BASE, query: { month: '2026-10' } }];
    const records = [{ _id: 'transactionsControllerList', baseUrl: BASE, query: { limit: 50 } }];
    const worth = [{ _id: 'netWorthControllerRead', baseUrl: BASE }];
    for (const key of [month, records, worth]) {
      client.setQueryData(key, {});
    }

    await user.type(await field('Карта'), '10');
    await user.click(done());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    for (const key of [month, records, worth]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
