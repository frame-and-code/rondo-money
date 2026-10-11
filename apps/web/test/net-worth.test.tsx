import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NetWorth } from '@/components/net-worth';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const WORTH_KEY = [{ _id: 'what-the-generator-minted', baseUrl: 'http://api.test' }];

interface Budget {
  id: string;
  name: string;
  currency: string;
  minorDigits: number;
  timezone: string;
  firstMonth: string;
  active: boolean;
}

const household: Budget = {
  id: 'b1',
  name: 'Household',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

const whole = {
  total: '999',
  accountsTotal: '111',
  assetsTotal: '222',
  liabilitiesTotal: '333',
  accounts: [
    { id: 'a1', name: 'Wallet', type: 'CASH', balance: '125050' },
    { id: 'a2', name: 'Card', type: 'DEBIT', balance: '-32000' },
  ],
  assets: [
    { id: 's1', name: 'Flat', amount: '50000000', date: '2026-03-12' },
    { id: 's2', name: 'Car', amount: '4800000', date: null },
  ],
  liabilities: [{ id: 'l1', name: 'Mortgage', amount: '41000000', date: '2026-08-01' }],
};

let budget: Budget = household;
let worth: typeof whole = whole;
let reads = 0;
let worthFails = false;
let budgetsHang = false;
let budgetsFail = false;
let holdReads = false;
let releaseRead: (() => void) | null = null;

interface Sent {
  operation: string;
  path?: { id: string };
  body: Record<string, unknown>;
}

const calls: Sent[] = [];
let refusals: unknown[] = [];
let holdWrites = false;
let rejectWrite: ((error: unknown) => void) | null = null;

const write = (operation: string) => ({
  mutationFn: (options: { path?: { id: string }; body: Record<string, unknown> }) => {
    calls.push({ operation, ...options });

    if (holdWrites) {
      return new Promise((_resolve, reject) => {
        rejectWrite = reject;
      });
    }

    return refusals.length > 0 ? Promise.reject(refusals.shift()) : Promise.resolve({});
  },
});

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'the-budgets', baseUrl: 'http://api.test' }],
    queryFn: () => {
      if (budgetsHang) return new Promise(() => {});

      return budgetsFail ? Promise.reject(new Error('down')) : Promise.resolve([budget]);
    },
  }),
  netWorthControllerReadOptions: () => ({
    queryKey: WORTH_KEY,
    queryFn: () => {
      reads += 1;

      if (worthFails) return Promise.reject(new Error('down'));

      if (holdReads) {
        return new Promise((resolve) => {
          releaseRead = () => resolve(worth);
        });
      }

      return Promise.resolve(worth);
    },
  }),
  netWorthControllerReadQueryKey: () => WORTH_KEY,
  assetsControllerCreateMutation: () => write('assets.create'),
  assetsControllerChangeMutation: () => write('assets.change'),
  assetsControllerRemoveMutation: () => write('assets.remove'),
  liabilitiesControllerCreateMutation: () => write('liabilities.create'),
  liabilitiesControllerChangeMutation: () => write('liabilities.change'),
  liabilitiesControllerRemoveMutation: () => write('liabilities.remove'),
}));

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="en">
        <NetWorth />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const pln = moneyOf('en', 'PLN', 2);

const shown = (text: string): RegExp =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'));

const narrow = (): void => {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
};

const wide = (): void => {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
};

const actionsFor = (kind: 'Asset' | 'Liability', name: string) =>
  screen.findByRole('button', {
    name: en[`netWorth.actionsFor${kind}`].replace('{{name}}', name),
  });

const fillAndSave = async (name: string, amount: string): Promise<void> => {
  await userEvent.type(await screen.findByLabelText(en['netWorth.nameLabel']), name);
  await userEvent.type(screen.getByLabelText(en['netWorth.amountLabel']), amount);
  await userEvent.click(screen.getByRole('button', { name: en['netWorth.save'] }));
};

const formGone = (): Promise<void> =>
  waitFor(() => expect(screen.queryByLabelText(en['netWorth.nameLabel'])).not.toBeInTheDocument());

afterEach(() => {
  wide();
  budget = household;
  worth = whole;
  reads = 0;
  worthFails = false;
  budgetsHang = false;
  budgetsFail = false;
  holdReads = false;
  releaseRead = null;
  calls.length = 0;
  refusals = [];
  holdWrites = false;
  rejectWrite = null;
});

describe('what the net worth screen shows', () => {
  it('shows the total and the three sides the server answered with, and adds nothing up itself', async () => {
    draw();

    expect(await screen.findByTestId('net-worth-total')).toHaveTextContent(shown(pln.format(999n)));
    expect(screen.getByTestId('net-worth-accounts-total')).toHaveTextContent(
      shown(pln.format(111n)),
    );
    expect(screen.getByTestId('net-worth-assets-total')).toHaveTextContent(shown(pln.format(222n)));
    expect(screen.getByTestId('net-worth-liabilities-total')).toHaveTextContent(
      shown(pln.format(333n)),
    );
  });

  it('lists every account, asset and liability under its own heading, with how many there are', async () => {
    draw();

    const accounts = await screen.findByTestId('net-worth-block-accounts');
    const assets = screen.getByTestId('net-worth-block-assets');
    const liabilities = screen.getByTestId('net-worth-block-liabilities');

    expect(within(accounts).getByRole('heading')).toHaveTextContent(
      `${en['netWorth.accounts']} (2)`,
    );
    expect(within(assets).getByRole('heading')).toHaveTextContent(`${en['netWorth.assets']} (2)`);
    expect(within(liabilities).getByRole('heading')).toHaveTextContent(
      `${en['netWorth.liabilities']} (1)`,
    );

    expect(within(accounts).getByText('Wallet')).toBeInTheDocument();
    expect(within(assets).getByText('Flat')).toBeInTheDocument();
    expect(within(assets).getByTestId('net-worth-amount-s1')).toHaveTextContent(
      shown(pln.format(50_000_000n)),
    );
    expect(within(liabilities).getByText('Mortgage')).toBeInTheDocument();
    expect(within(assets).queryByText('Mortgage')).not.toBeInTheDocument();
  });

  it('shows a total below zero with its minus, in the colour of the pool rather than in red', async () => {
    worth = { ...whole, total: '-4967000' };
    draw();

    const total = await screen.findByTestId('net-worth-total');

    expect(total.textContent).toMatch(/[−-]/);
    expect(total).toHaveClass('text-primary', 'dark:text-chart-2');
    expect(total).not.toHaveClass('text-destructive');

    const spent = screen.getByTestId('net-worth-amount-a2');

    expect(spent.textContent).toMatch(/[−-]/);
    expect(spent).not.toHaveClass('text-destructive');
  });

  it('gives an asset its actions and an account none, because accounts are kept elsewhere', async () => {
    draw();

    expect(await screen.findByTestId('net-worth-row-s1')).toContainElement(
      await actionsFor('Asset', 'Flat'),
    );
    expect(
      within(screen.getByTestId('net-worth-row-a1')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('net-worth-block-accounts')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('shows the day a row carries and nothing where it carries none', async () => {
    draw();

    expect(await screen.findByTestId('net-worth-date-s1')).toHaveTextContent('12 March 2026');
    expect(screen.queryByTestId('net-worth-date-s2')).not.toBeInTheDocument();
  });

  it('invites the first asset and the first liability, and keeps the way to add one', async () => {
    worth = { ...whole, accounts: [], assets: [], liabilities: [] };
    draw();

    expect(await screen.findByText(en['netWorth.emptyAssets'])).toBeInTheDocument();
    expect(screen.getByText(en['netWorth.emptyLiabilities'])).toBeInTheDocument();
    expect(screen.getByText(en['accounts.empty'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['netWorth.addAsset'] })).toBeEnabled();
    expect(screen.getByRole('button', { name: en['netWorth.addLiability'] })).toBeEnabled();
  });

  it('renders every amount under a currency that carries no minor digits', async () => {
    const yen = moneyOf('en', 'JPY', 0);
    budget = { ...household, currency: 'JPY', minorDigits: 0 };
    worth = {
      ...whole,
      total: '5000',
      assets: [{ id: 's1', name: 'Flat', amount: '5000', date: null }],
    };
    draw();

    expect(await screen.findByTestId('net-worth-total')).toHaveTextContent(
      shown(yen.format(5_000n)),
    );
    expect(screen.getByTestId('net-worth-amount-s1')).toHaveTextContent(shown(yen.format(5_000n)));
    expect(screen.getByTestId('net-worth-total')).not.toHaveTextContent(shown(pln.format(5_000n)));

    await userEvent.click(await actionsFor('Asset', 'Flat'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));

    expect(
      await screen.findByText(
        shown(en['netWorth.deleteAssetLine'].replace('{{amount}}', yen.format(5_000n))),
      ),
    ).toBeInTheDocument();
  });
});

describe('what the screen does when it could not be read', () => {
  it('says so instead of the screen when net worth never arrived', async () => {
    worthFails = true;
    draw();

    expect(await screen.findByText(en['netWorth.unavailable'])).toBeInTheDocument();
    expect(screen.queryByTestId('net-worth-total')).not.toBeInTheDocument();
  });

  it('says so instead of the screen when the budget never arrived', async () => {
    budgetsFail = true;
    draw();

    expect(await screen.findByText(en['netWorth.unavailable'])).toBeInTheDocument();
    expect(screen.queryByTestId('net-worth-total')).not.toBeInTheDocument();
  });

  it('draws nothing before the budget has answered, because amounts have no currency yet', async () => {
    budgetsHang = true;
    draw();

    await waitFor(() => expect(reads).toBe(1));

    expect(screen.queryByTestId('net-worth-total')).not.toBeInTheDocument();
    expect(screen.queryByText(en['netWorth.unavailable'])).not.toBeInTheDocument();
  });

  it('keeps what is on screen when a later read fails', async () => {
    draw();
    await screen.findByTestId('net-worth-total');

    worthFails = true;
    await userEvent.click(screen.getByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    await formGone();

    expect(screen.getByTestId('net-worth-total')).toHaveTextContent(shown(pln.format(999n)));
    expect(screen.queryByText(en['netWorth.unavailable'])).not.toBeInTheDocument();
  });
});

describe('writing from the screen', () => {
  it('opens the form of the side whose button was pressed', async () => {
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    expect(
      await screen.findByRole('heading', { name: en['netWorth.newAsset'] }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));
    await formGone();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.addLiability'] }));
    expect(
      await screen.findByRole('heading', { name: en['netWorth.newLiability'] }),
    ).toBeInTheDocument();
  });

  it('opens a row for a change with what the row holds, and for a deletion with its name', async () => {
    draw();

    await userEvent.click(
      await screen.findByRole('button', {
        name: en['netWorth.actionsForLiability'].replace('{{name}}', 'Mortgage'),
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.edit'] }));

    expect(
      await screen.findByRole('heading', { name: en['netWorth.editLiability'] }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(en['netWorth.nameLabel'])).toHaveValue('Mortgage');
    expect(screen.getByLabelText(en['netWorth.amountLabel'])).toHaveValue(pln.typed(41_000_000n));

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));
    await formGone();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));

    expect(
      await screen.findByRole('heading', {
        name: en['netWorth.deleteAssetTitle'].replace('{{name}}', 'Car'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        shown(en['netWorth.deleteAssetLine'].replace('{{amount}}', pln.format(4_800_000n))),
      ),
    ).toBeInTheDocument();
  });

  it('sends a new asset to the assets, closes the form and reads net worth again', async () => {
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      operation: 'assets.create',
      body: { name: 'Garage', amount: '10000', idempotencyKey: expect.any(String) },
    });
    expect(calls[0]?.body['date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await formGone();
    await waitFor(() => expect(reads).toBe(2));
  });

  it('sends a change of a liability to that liability, and reads net worth again', async () => {
    draw();

    await userEvent.click(
      await screen.findByRole('button', {
        name: en['netWorth.actionsForLiability'].replace('{{name}}', 'Mortgage'),
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.edit'] }));
    await userEvent.type(await screen.findByLabelText(en['netWorth.nameLabel']), ' loan');
    await userEvent.click(screen.getByRole('button', { name: en['netWorth.save'] }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      operation: 'liabilities.change',
      path: { id: 'l1' },
      body: { name: 'Mortgage loan', amount: '41000000', date: '2026-08-01' },
    });

    await formGone();
    await waitFor(() => expect(reads).toBe(2));
  });

  it('sends a deletion of an asset to that asset under a key, and reads net worth again', async () => {
    draw();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      operation: 'assets.remove',
      path: { id: 's2' },
      body: { idempotencyKey: expect.any(String) },
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: en['netWorth.delete'] })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(reads).toBe(2));
  });

  it('gives every opening a key of its own, whichever form it is', async () => {
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');
    await formGone();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Shed', '50');
    await formGone();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.addLiability'] }));
    await fillAndSave('Loan', '70');
    await formGone();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));

    await waitFor(() => expect(calls).toHaveLength(4));

    const keys = calls.map((call) => call.body['idempotencyKey']);

    expect(keys.every((key) => typeof key === 'string' && key !== '')).toBe(true);
    expect(new Set(keys).size).toBe(4);
  });
});

describe('a write the server did not take', () => {
  it('reads net worth again after a refusal the server recorded, and keeps the form open on it', async () => {
    refusals = [{ statusCode: 400, reason: 'UNKNOWN_ASSET' }];
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(en['netWorth.failTitle']);
    expect(alert.closest('[data-slot="dialog-content"]')).not.toBeNull();
    expect(screen.getByLabelText(en['netWorth.nameLabel'])).toHaveValue('Garage');
    await waitFor(() => expect(reads).toBe(2));
  });

  it('reads nothing again when the answer simply never arrived, and sends the same key on a retry', async () => {
    refusals = [new Error('offline')];
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');

    expect(await screen.findByRole('alert')).toHaveTextContent(en['netWorth.failBody']);
    expect(reads).toBe(1);
    expect(screen.getByLabelText(en['netWorth.nameLabel'])).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.save'] }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body['idempotencyKey']).toBe(calls[0]?.body['idempotencyKey']);
  });

  it('sends the same key when a deletion whose answer never arrived is pressed again', async () => {
    refusals = [new Error('offline')];
    draw();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['netWorth.failTitle']);

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.delete'] }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body['idempotencyKey']).toBe(calls[0]?.body['idempotencyKey']);
  });

  it('takes a third press of a deletion after the second one failed the same way', async () => {
    refusals = [new Error('offline'), new Error('offline')];
    draw();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.delete'] }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['netWorth.delete'] })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.delete'] }));

    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]?.body['idempotencyKey']).toBe(calls[0]?.body['idempotencyKey']);
  });

  it('opens nothing while a write it walked away from is still out, so its answer lands on no other form', async () => {
    holdWrites = true;
    draw();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));
    await waitFor(() => expect(calls).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByRole('button', { name: en['netWorth.addAsset'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['netWorth.addLiability'] })).toBeDisabled();
    expect(await actionsFor('Asset', 'Flat')).toBeDisabled();

    holdWrites = false;
    act(() => rejectWrite?.(new Error('offline')));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['netWorth.addAsset'] })).toBeEnabled(),
    );
    await userEvent.click(await actionsFor('Asset', 'Flat'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.edit'] }));

    expect(await screen.findByLabelText(en['netWorth.nameLabel'])).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reads net worth again when a form is closed on a request nobody retried, and opens nothing until it has', async () => {
    refusals = [new Error('offline')];
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');
    await screen.findByRole('alert');

    holdReads = true;
    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));
    await formGone();

    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByRole('button', { name: en['netWorth.addAsset'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['netWorth.addLiability'] })).toBeDisabled();
    expect(await actionsFor('Asset', 'Car')).toBeDisabled();

    act(() => releaseRead?.());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['netWorth.addAsset'] })).toBeEnabled(),
    );
  });

  it('reads net worth again when a deletion is walked away from after it was sent', async () => {
    refusals = [new Error('offline')];
    draw();

    await userEvent.click(await actionsFor('Asset', 'Car'));
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.delete'] }));
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));

    await waitFor(() => expect(reads).toBe(2));
  });

  it('does not carry a failure from a form nobody has open into the next one', async () => {
    holdWrites = true;
    draw();

    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));
    await fillAndSave('Garage', '100');
    await waitFor(() => expect(calls).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));
    await formGone();

    holdWrites = false;
    act(() => rejectWrite?.({ statusCode: 400 }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['netWorth.addLiability'] })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: en['netWorth.addLiability'] }));

    expect(
      await screen.findByRole('heading', { name: en['netWorth.newLiability'] }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the day a new form opens on', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true }).setSystemTime(new Date('2026-08-20T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['Pacific/Kiritimati', /21 August 2026/],
    ['Pacific/Niue', /20 August 2026/],
  ])('is today in the budget zone %s, not on the clock of the browser', async (timezone, day) => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    budget = { ...household, timezone };
    draw();

    await user.click(await screen.findByRole('button', { name: en['netWorth.addAsset'] }));

    expect(await screen.findByRole('button', { name: day })).toBeInTheDocument();
  });
});

describe('the screen on a phone', () => {
  it('opens the row actions, the form and its failure in a sheet from below', async () => {
    narrow();
    refusals = [{ statusCode: 409 }];
    draw();

    await userEvent.click(
      await screen.findByRole('button', {
        name: en['netWorth.actionsForAsset'].replace('{{name}}', 'Car'),
      }),
    );

    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    const edit = await screen.findByRole('button', { name: en['netWorth.edit'] });

    expect(edit.closest('[data-slot="drawer-content"]')).not.toBeNull();

    await userEvent.click(edit);

    const name = await screen.findByLabelText(en['netWorth.nameLabel']);

    expect(name.closest('[data-slot="drawer-content"]')).not.toBeNull();
    expect(name.closest('[data-slot="dialog-content"]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.save'] }));

    const alert = await screen.findByRole('alert');

    expect(alert.closest('[data-slot="drawer-content"]')).not.toBeNull();
  });

  it('opens the deletion and its failure in a sheet from below too', async () => {
    narrow();
    refusals = [{ statusCode: 400, reason: 'UNKNOWN_LIABILITY' }];
    draw();

    await userEvent.click(
      await screen.findByRole('button', {
        name: en['netWorth.actionsForLiability'].replace('{{name}}', 'Mortgage'),
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: en['netWorth.delete'] }));

    const heading = await screen.findByRole('heading', {
      name: en['netWorth.deleteLiabilityTitle'].replace('{{name}}', 'Mortgage'),
    });

    expect(heading.closest('[data-slot="drawer-content"]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.delete'] }));

    const alert = await screen.findByRole('alert');

    expect(alert.closest('[data-slot="drawer-content"]')).not.toBeNull();
  });

  it('opens the form in a dialog and the actions in a menu where the width is there', async () => {
    draw();

    await userEvent.click(
      await screen.findByRole('button', {
        name: en['netWorth.actionsForAsset'].replace('{{name}}', 'Car'),
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: en['netWorth.edit'] }));

    const name = await screen.findByLabelText(en['netWorth.nameLabel']);

    expect(name.closest('[data-slot="dialog-content"]')).not.toBeNull();
    expect(name.closest('[data-slot="drawer-content"]')).toBeNull();
  });
});
