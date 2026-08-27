import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BudgetMonth } from '@/components/budget-month';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

const move = jest.fn();
const push = jest.fn();

let search = '';
let view: {
  month: string;
  readyToAssign: string;
  groups: Array<{
    id: string;
    name: string;
    categories: Array<Record<string, unknown>>;
  }>;
};

const budget = {
  id: 'b1',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => push(href) as unknown, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/categories',
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  budgetViewControllerReadOptions: ({ query }: { query: { month: string } }) => ({
    queryKey: [{ _id: 'budgetViewControllerRead', baseUrl: 'http://api', query }],
    queryFn: () => (viewFails ? Promise.reject(new Error('unreachable')) : Promise.resolve(view)),
  }),
  budgetViewControllerReadQueryKey: ({ query }: { query: { month: string } }) => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api', query },
  ],
  movesControllerMoveMutation: () => ({
    mutationFn: (options: unknown) => move(options) as unknown,
  }),
}));

let viewFails = false;

const CATEGORY_ID = '0199c1a8-9ecf-71c7-a617-c575df073700';
const OTHER_ID = '0199c1a8-9ecf-71c7-a617-c575df073701';

const monthOf = (over: Partial<(typeof view)['groups'][number]['categories'][number]> = {}) => ({
  month: '2026-08',
  readyToAssign: '85000',
  groups: [
    {
      id: 'g1',
      name: 'Повседневные расходы',
      categories: [
        {
          id: CATEGORY_ID,
          name: 'Продукты',
          icon: 'cart',
          color: 'green',
          assigned: '48000',
          activity: '0',
          available: '48000',
          ...over,
        },
      ],
    },
  ],
});

const withTwoCategories = () => ({
  month: '2026-08',
  readyToAssign: '85000',
  groups: [
    {
      id: 'g1',
      name: 'Повседневные расходы',
      categories: [
        {
          id: CATEGORY_ID,
          name: 'Продукты',
          icon: 'cart',
          color: 'green',
          assigned: '48000',
          activity: '0',
          available: '48000',
        },
        {
          id: OTHER_ID,
          name: 'Транспорт',
          icon: 'car',
          color: 'orange',
          assigned: '30000',
          activity: '0',
          available: '30000',
        },
      ],
    },
  ],
});

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ru">
        <BudgetMonth />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const setup = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

const openCell = async (
  user: ReturnType<typeof setup>,
  name = 'Продукты',
): Promise<HTMLElement> => {
  await screen.findByText(name);
  await user.click(
    screen.getByRole('button', {
      name: ru['categories.assignEdit'].replace('{{category}}', name),
    }),
  );

  return screen.getByLabelText(ru['categories.assignField']);
};

const typeAmount = async (user: ReturnType<typeof setup>, field: HTMLElement, value: string) => {
  await user.clear(field);
  await user.type(field, value);
};

const save = async (user: ReturnType<typeof setup>) => {
  await user.click(screen.getByRole('button', { name: ru['categories.assignSave'] }));
};

const assignedOf = (name = 'Продукты'): HTMLElement =>
  screen.getByRole('button', {
    name: ru['categories.assignEdit'].replace('{{category}}', name),
  });

const bodyOf = (call: number): Record<string, unknown> => {
  const options = move.mock.calls[call]?.[0] as { body?: Record<string, unknown> } | undefined;
  if (!options?.body) {
    throw new Error(`Call ${call} carried no body: ${JSON.stringify(options)}`);
  }

  return options.body;
};

const refused = (statusCode: number, reason?: string) =>
  Promise.reject({
    statusCode,
    error: statusCode === 409 ? 'Conflict' : 'Bad Request',
    message: 'no',
    ...(reason === undefined ? {} : { reason }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  jest.useFakeTimers({ advanceTimers: true }).setSystemTime(new Date('2026-08-15T12:00:00Z'));
  search = '';
  viewFails = false;
  view = monthOf();
  move.mockResolvedValue({
    month: '2026-08',
    amount: '1',
    from: { kind: 'READY_TO_ASSIGN' },
    to: { kind: 'CATEGORY', categoryId: CATEGORY_ID },
  });
  window.innerWidth = 1440;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('what writing an amount into a cell sends', () => {
  it('moves the difference out of what is free and into the category, and names the month on screen', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      month: '2026-08',
      amount: '12000',
      from: { kind: 'READY_TO_ASSIGN' },
      to: { kind: 'CATEGORY', categoryId: CATEGORY_ID },
    });
  });

  it('names the month the reader is looking at rather than the month it is today', async () => {
    search = 'month=2026-11';
    view = { ...monthOf(), month: '2026-11' };
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ month: '2026-11' });
  });

  it('swaps the two sides when the amount goes down', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '300,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      amount: '18000',
      from: { kind: 'CATEGORY', categoryId: CATEGORY_ID },
      to: { kind: 'READY_TO_ASSIGN' },
    });
  });

  it('takes an amount below zero and sends the difference that gets there', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '-100,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      amount: '58000',
      from: { kind: 'CATEGORY', categoryId: CATEGORY_ID },
      to: { kind: 'READY_TO_ASSIGN' },
    });
  });

  it('counts the difference in minor units, so a cent is never lost to a float', async () => {
    view = monthOf({ assigned: '2', available: '2' });
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '0,03');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '1' });
  });

  it('sends nothing when the amount did not change', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '480,00');
    await save(user);

    await waitFor(() =>
      expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument(),
    );
    expect(move).not.toHaveBeenCalled();
  });

  it('measures the second edit from what the first one wrote', async () => {
    const user = setup();
    draw();

    const first = await openCell(user);
    await typeAmount(user, first, '600,00');

    view = monthOf({ assigned: '60000', available: '60000' });
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^600,00/));

    const second = await openCell(user);
    await typeAmount(user, second, '700,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ amount: '10000' });
  });

  it('saves on Enter and leaves the amount alone on Escape', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    const again = await openCell(user);
    await typeAmount(user, again, '900,00');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument(),
    );
    expect(move).toHaveBeenCalledTimes(1);
  });
});

describe('the key the operation is written under', () => {
  it('keeps one key across two submits of one opening', async () => {
    move.mockImplementation(() => new Promise(() => {}));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    const key = bodyOf(0).idempotencyKey;
    expect(typeof key).toBe('string');
    expect(key).not.toBe('');
  });

  it('mints a new key after a success, so the next edit is a new operation', async () => {
    const user = setup();
    draw();

    const first = await openCell(user);
    await typeAmount(user, first, '600,00');

    view = monthOf({ assigned: '60000', available: '60000' });
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^600,00/));

    const second = await openCell(user);
    await typeAmount(user, second, '700,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));

    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });

  it('gives two cells two keys', async () => {
    view = withTwoCategories();
    const user = setup();
    draw();

    const first = await openCell(user, 'Продукты');
    await typeAmount(user, first, '600,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    const second = await openCell(user, 'Транспорт');
    await typeAmount(user, second, '400,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));

    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });

  it('refuses to open another cell while a save is in flight, so a retry cannot name the wrong one', async () => {
    view = withTwoCategories();
    move.mockImplementation(() => new Promise(() => {}));
    const user = setup();
    draw();

    const field = await openCell(user, 'Продукты');
    await typeAmount(user, field, '600,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Транспорт'),
      }),
    );

    const open = screen.getByLabelText(ru['categories.assignField']);

    expect(open).toHaveValue('600,00');
    expect(open).toBeDisabled();
    expect(move).toHaveBeenCalledTimes(1);
  });

  it('freezes the field while the request is in flight, so the body cannot outrun its key', async () => {
    move.mockImplementation(() => new Promise(() => {}));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    await save(user);
    await save(user);

    expect(move).toHaveBeenCalledTimes(1);
  });
});

describe('when saving does not go through', () => {
  const failures = [
    ['a conflict', () => refused(409), ru['categories.failConflict']],
    ['a hidden category', () => refused(400, 'CATEGORY_HIDDEN'), ru['categories.failHidden']],
    ['a budget that changed', () => refused(400, 'NO_ACTIVE_BUDGET'), ru['categories.failBudget']],
    [
      'no connection',
      () => Promise.reject(new TypeError('Failed to fetch')),
      ru['categories.failNetwork'],
    ],
  ] as const;

  it.each(failures)('leaves the amount and what is free alone: %s', async (_name, fail) => {
    move.mockImplementation(fail);
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(ru['categories.failTitle']);

    expect(screen.getByTestId('ready-to-assign')).toHaveTextContent(/850,00/);
    expect(screen.getByTestId('available-Продукты')).toHaveTextContent(/480,00/);

    jest.advanceTimersByTime(30_000);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('takes the number the server holds after a conflict, and opens the field again', async () => {
    move.mockImplementation(() => refused(409));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');

    view = monthOf({ assigned: '99900', available: '99900' });
    await save(user);

    const banner = await screen.findByRole('alert');

    expect(banner).toHaveTextContent(ru['categories.failConflict']);
    expect(within(banner).queryAllByRole('button')).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByLabelText(ru['categories.assignField'])).toHaveValue('999,00'),
    );
  });

  it('closes the field and re-reads the month when the category was hidden', async () => {
    move.mockImplementation(() => refused(400, 'CATEGORY_HIDDEN'));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');

    view = monthOf({ assigned: '77700', available: '77700' });
    await save(user);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Продукты');
    expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument();
    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^777,00/));

    await user.click(within(banner).getByRole('button', { name: ru['categories.failDismiss'] }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('offers to reload the whole screen when the active budget changed', async () => {
    move.mockImplementation(() => refused(400, 'NO_ACTIVE_BUDGET'));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');
    expect(
      within(banner).getByRole('button', { name: ru['categories.failRefresh'] }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument();
  });

  it('keeps what was typed in the open field when the request never arrived', async () => {
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');
    expect(
      within(banner).getByRole('button', { name: ru['categories.failRetry'] }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: ru['categories.failCancel'] }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(ru['categories.assignField'])).toHaveValue('600,00');
  });

  it('retries a lost request under the same key, and a refusal under a new one', async () => {
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');
    await user.click(within(banner).getByRole('button', { name: ru['categories.failRetry'] }));

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).idempotencyKey).toBe(bodyOf(0).idempotencyKey);
  });

  it('mints a new key for the attempt after a refusal, because that is a new intent', async () => {
    move.mockImplementation(() => refused(409));
    const user = setup();
    draw();

    const first = await openCell(user);
    await typeAmount(user, first, '600,00');
    await save(user);
    await screen.findByRole('alert');

    const again = screen.getByLabelText(ru['categories.assignField']);
    await typeAmount(user, again, '700,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });

  it('re-reads the month when an unretried request is thrown away, because it may have landed', async () => {
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');

    view = monthOf({ assigned: '60000', available: '60000' });
    await user.click(within(banner).getByRole('button', { name: ru['categories.failCancel'] }));

    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^600,00/));
  });

  it('measures the next edit from the server after a thrown away request, not from the stale tile', async () => {
    move.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');

    view = monthOf({ assigned: '60000', available: '60000' });
    await user.click(within(banner).getByRole('button', { name: ru['categories.failCancel'] }));
    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^600,00/));

    const again = await openCell(user);
    await typeAmount(user, again, '700,00');
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ amount: '10000' });
  });

  it('names the category that failed even when the field was closed before the answer came', async () => {
    let refuse: (reason: unknown) => void = () => {};
    move.mockImplementation(
      () =>
        new Promise((_, reject) => {
          refuse = reject;
        }),
    );
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: ru['categories.assignCancel'] }));
    refuse({
      statusCode: 400,
      error: 'Bad Request',
      message: 'no',
      reason: 'CATEGORY_HIDDEN',
    });

    const banner = await screen.findByRole('alert');

    expect(banner).toHaveTextContent('Продукты');
    expect(banner).not.toHaveTextContent('«»');
  });

  it('keeps the month on screen when the re-read fails too, rather than blanking the budget', async () => {
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');

    viewFails = true;
    await user.click(within(banner).getByRole('button', { name: ru['categories.failCancel'] }));

    await waitFor(() => expect(screen.getByText(ru['categories.unavailable'])).toBeInTheDocument());
    expect(assignedOf()).toBeInTheDocument();
    expect(screen.getByText('Продукты')).toBeInTheDocument();
  });

  it('refuses to write from a month whose read failed, so no delta is measured from a stale base', async () => {
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    const banner = await screen.findByRole('alert');

    viewFails = true;
    await user.click(within(banner).getByRole('button', { name: ru['categories.failCancel'] }));
    await waitFor(() => expect(screen.getByText(ru['categories.unavailable'])).toBeInTheDocument());

    move.mockClear();
    await user.click(assignedOf());

    expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
  });

  it('marks the tile that did not save', async () => {
    move.mockImplementation(() => refused(400, 'CATEGORY_HIDDEN'));
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');
    await save(user);

    await screen.findByRole('alert');
    const tile = screen.getByText('Продукты').closest('[data-slot="category-tile"]');

    expect(tile).toHaveAttribute('data-failed', 'true');
  });
});

describe('what the screen believes after a save', () => {
  it('shows what the api answered, even when that contradicts the arithmetic in the browser', async () => {
    const user = setup();
    draw();

    const field = await openCell(user);
    await typeAmount(user, field, '600,00');

    view = { ...monthOf({ assigned: '60000', available: '60000' }), readyToAssign: '85000' };
    await save(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assignedOf()).toHaveTextContent(/^600,00/));
    expect(screen.getByTestId('ready-to-assign')).toHaveTextContent(/850,00/);
  });
});

describe('on a phone', () => {
  it('shows a refusal inside the drawer, where the reader can reach it', async () => {
    window.innerWidth = 390;
    move.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    const drawer = await screen.findByRole('dialog');
    await user.clear(within(drawer).getByLabelText(ru['categories.assignField']));
    await user.type(within(drawer).getByLabelText(ru['categories.assignField']), '600,00');
    await user.click(within(drawer).getByRole('button', { name: ru['categories.assignSave'] }));

    const banner = await within(drawer).findByRole('alert');

    expect(banner).toHaveTextContent(ru['categories.failTitle']);
    expect(within(banner).getByRole('button', { name: ru['categories.failRetry'] })).toBeEnabled();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('opens on an empty field when nothing is assigned, so there is nothing to delete first', async () => {
    window.innerWidth = 390;
    view = monthOf({ assigned: '0', available: '0' });
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    const drawer = await screen.findByRole('dialog');

    const field = within(drawer).getByLabelText(ru['categories.assignField']);

    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', '0,00');
    expect(field).toHaveFocus();
  });

  it('keeps an amount that is not zero, so it can be corrected rather than retyped', async () => {
    window.innerWidth = 390;
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByLabelText(ru['categories.assignField'])).toHaveValue('480,00');
  });

  it('edits the amount in the drawer rather than in the tile', async () => {
    window.innerWidth = 390;
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByLabelText(ru['categories.assignField'])).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: ru['categories.assignSave'] }),
    ).toBeInTheDocument();
  });
});
