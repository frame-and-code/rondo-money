import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BudgetMonth } from '@/components/budget-month';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

const move = jest.fn();

let search = '';
let view: {
  month: string;
  readyToAssign: string;
  groups: Array<{ id: string; name: string; categories: Array<Record<string, unknown>> }>;
};

let budget = {
  id: 'b1',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

let viewFails = false;
let viewHolds: Promise<void> | null = null;
let reads = 0;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
    queryFn: () => {
      reads += 1;

      return viewFails
        ? Promise.reject(new Error('unreachable'))
        : (viewHolds ?? Promise.resolve()).then(() => view);
    },
  }),
  budgetViewControllerReadQueryKey: ({ query }: { query: { month: string } }) => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api', query },
  ],
  categoriesControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerHideMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerReorderMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerHideMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  movesControllerMoveMutation: () => ({
    mutationFn: (options: unknown) => move(options) as unknown,
  }),
}));

const FOOD = '0199c1a8-9ecf-71c7-a617-c575df073700';
const CAR = '0199c1a8-9ecf-71c7-a617-c575df073701';

const POOL_ROW = ru['categories.readyToAssign'];

const monthOf = (over: Record<string, unknown> = {}) => ({
  month: '2026-08',
  readyToAssign: '85000',
  groups: [
    {
      id: 'g1',
      name: 'Повседневные расходы',
      categories: [
        {
          id: FOOD,
          name: 'Продукты',
          icon: 'shopping-cart',
          color: 'green',
          assigned: '48000',
          activity: '0',
          available: '48000',
          ...over,
        },
        {
          id: CAR,
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

const triggerOf = (name = 'Продукты'): HTMLElement =>
  screen.getByRole('button', {
    name: ru['categories.moveOpen'].replace('{{category}}', name),
  });

const surface = (): HTMLElement => screen.getByTestId('move-dialog');

const openMove = async (
  user: ReturnType<typeof setup>,
  name = 'Продукты',
): Promise<HTMLElement> => {
  await screen.findByText(name);
  await user.click(triggerOf(name));

  return within(await screen.findByTestId('move-dialog')).getByLabelText(
    ru['categories.moveAmountFor'].replace('{{envelope}}', name),
  );
};

const amountFor = (name: string): HTMLElement =>
  within(surface()).getByLabelText(ru['categories.moveAmountFor'].replace('{{envelope}}', name));

const typeAmount = async (user: ReturnType<typeof setup>, value: string) => {
  const field = amountFor('Продукты');

  await user.clear(field);
  await user.type(field, value);
};

const otherOf = (name: string) =>
  within(surface()).getByRole('combobox', {
    name: ru['categories.moveOther'].replace('{{envelope}}', name),
  });

const swap = async (user: ReturnType<typeof setup>) => {
  await user.click(
    within(surface()).getByRole('button', {
      name: new RegExp(ru['categories.moveSwapIn'] + '|' + ru['categories.moveSwapOut']),
    }),
  );
};

const action = () =>
  within(surface()).getByRole('button', {
    name: new RegExp(
      [
        ru['categories.moveSubmit'],
        ru['categories.moveAssign'],
        ru['categories.moveSubmitting'],
      ].join('|'),
    ),
  });

const submit = async (user: ReturnType<typeof setup>) => {
  await user.click(action());
};

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

const lost = () => Promise.reject(new TypeError('Failed to fetch'));

const category = (id: string) => ({ kind: 'CATEGORY', categoryId: id });
const pool = { kind: 'READY_TO_ASSIGN' };

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  jest.useFakeTimers({ advanceTimers: true }).setSystemTime(new Date('2026-08-15T12:00:00Z'));
  search = '';
  reads = 0;
  viewFails = false;
  viewHolds = null;
  budget = {
    id: 'b1',
    currency: 'PLN',
    minorDigits: 2,
    timezone: 'Europe/Warsaw',
    firstMonth: '2026-01',
    active: true,
  };
  view = monthOf();
  move.mockResolvedValue({
    month: '2026-08',
    amount: '1',
    from: pool,
    to: category(FOOD),
  });
  window.innerWidth = 1440;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('what the popover sends', () => {
  it('offers no action until the amount is one the server would take', async () => {
    view = monthOf({ assigned: '0', available: '0' });
    const user = setup();
    draw();

    await openMove(user);

    expect(action()).toBeDisabled();

    await typeAmount(user, '0');

    expect(action()).toBeDisabled();

    await typeAmount(user, '150,00');

    expect(action()).toBeEnabled();
  });

  it('offers to give an empty category money, which is the only thing to do with one', async () => {
    view = monthOf({ assigned: '0', available: '0' });
    const user = setup();
    draw();

    await openMove(user);

    expect(amountFor('Продукты')).toHaveValue('');

    await typeAmount(user, '150,00');
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      month: '2026-08',
      amount: '15000',
      from: pool,
      to: category(FOOD),
    });
  });

  it('offers to take back what a category already holds, whole, in one press', async () => {
    const user = setup();
    draw();

    await openMove(user);

    expect(amountFor('Продукты')).toHaveValue('480,00');

    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '48000', from: category(FOOD), to: pool });
  });

  it('offers to cover an overspend rather than deepen it', async () => {
    view = monthOf({ assigned: '30000', activity: '-42500', available: '-12500' });
    const user = setup();
    draw();

    await openMove(user);

    expect(amountFor('Продукты')).toHaveValue('125,00');

    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '12500', from: pool, to: category(FOOD) });
  });

  it('sends it the other way once the arrow is turned around', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await swap(user);
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '15000', from: pool, to: category(FOOD) });
  });

  it('names the month the reader is looking at rather than the month it is today', async () => {
    search = 'month=2026-09';
    view = { ...monthOf(), month: '2026-09' };
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ month: '2026-09' });
  });

  it('reads an amount someone assembled out of terms as one amount', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '434+35');
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '46900' });
  });

  it('turns the direction around without touching the amount', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '434+35');
    await swap(user);
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '46900', from: pool, to: category(FOOD) });
  });

  it('refuses to write an expression nobody finished typing, while still showing it', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '12+');
    await submit(user);

    expect(move).not.toHaveBeenCalled();
    expect(amountFor('Продукты')).toHaveValue('12+');
  });

  it('sends nothing when there is no amount to move', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await user.clear(amountFor('Продукты'));
    await submit(user);
    await typeAmount(user, '0');
    await submit(user);

    expect(move).not.toHaveBeenCalled();
  });

  it('sends nothing for an amount typed with a minus, because the arrow owns the direction', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '-150,00');
    await submit(user);

    expect(move).not.toHaveBeenCalled();
    expect(surface()).toBeInTheDocument();
  });

  it('keeps the popover open on an amount that cannot be read, because a typo is fixable', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '12,345');
    await submit(user);

    expect(move).not.toHaveBeenCalled();
    expect(surface()).toBeInTheDocument();
    expect(amountFor('Продукты')).toHaveValue('12,345');
  });
});

describe('which way the money goes', () => {
  it('shows both envelopes with their balances, the category first', async () => {
    const user = setup();
    draw();

    const field = await openMove(user);

    expect(field).toHaveFocus();
    expect(surface()).toHaveTextContent('Продукты');
    expect(surface()).toHaveTextContent(POOL_ROW);
    expect(surface()).toHaveTextContent('480,00');
    expect(surface()).toHaveTextContent('850,00');
  });

  it('says what turning the arrow would do, in both directions', async () => {
    const user = setup();
    draw();

    await openMove(user);

    expect(
      within(surface()).getByRole('button', { name: ru['categories.moveSwapIn'] }),
    ).toBeInTheDocument();

    await swap(user);

    expect(
      within(surface()).getByRole('button', { name: ru['categories.moveSwapOut'] }),
    ).toBeInTheDocument();
  });

  it('calls it assigning when the money comes out of what is free', async () => {
    const user = setup();
    draw();

    await openMove(user);

    expect(action()).toHaveTextContent(ru['categories.moveSubmit']);

    await swap(user);

    expect(action()).toHaveTextContent(ru['categories.moveAssign']);
  });

  it('shows the amount on both rows, so the second envelope is never a guess', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');

    expect(amountFor(POOL_ROW)).toHaveValue('150,00');
  });
});

describe('the surface a modal makes of the page', () => {
  it('puts a backdrop up only while it is open', async () => {
    const user = setup();
    draw();

    await screen.findByText('Продукты');

    expect(document.querySelectorAll("[data-slot='popover-backdrop']")).toHaveLength(0);

    await user.click(triggerOf());
    await screen.findByTestId('move-dialog');

    expect(document.querySelectorAll("[data-slot='popover-backdrop']")).toHaveLength(1);
  });

  it('names itself after the category, and offers a way out to a keyboard', async () => {
    const user = setup();
    draw();

    await openMove(user);

    expect(surface()).toHaveAccessibleName('Продукты');
    expect(
      within(surface()).getByRole('button', { name: ru['categories.moveClose'] }),
    ).toBeInTheDocument();
  });

  it('keeps itself and the amount when a tab goes past the last control', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');

    const controls = surface().querySelectorAll('button, input').length;

    for (let step = 0; step <= controls; step += 1) {
      await user.tab();
    }

    expect(screen.getByTestId('move-dialog')).toBeInTheDocument();
    expect(amountFor('Продукты')).toHaveValue('150,00');
    expect(move).not.toHaveBeenCalled();
  });

  it('refuses to open another card while a request of the first one is in flight', async () => {
    move.mockImplementation(() => new Promise(() => {}));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());

    await user.click(triggerOf('Транспорт'));

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
    expect(move).toHaveBeenCalledTimes(1);
  });
});

describe('the island above an open dialog', () => {
  it('keeps what is free readable and offers no control the dialog would swallow', async () => {
    const user = setup();
    draw();

    await openMove(user);

    const island = screen.getByTestId('ready-to-assign-island');

    expect(island).toHaveTextContent(/850,00/);
    expect(within(island).queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes the island away once a dialog covers the screen, since nothing behind it is usable', async () => {
    const user = setup();
    draw();

    await openMove(user);

    const island = screen.getByTestId('ready-to-assign-island');
    expect(island.parentElement).toHaveClass('opacity-100');

    await user.click(screen.getByRole('button', { name: ru['categories.manage'] }));
    await user.click(screen.getByRole('button', { name: ru['categories.edit'] }));

    expect(await screen.findByLabelText(ru['categories.nameLabel'])).toBeInTheDocument();
    expect(screen.getByTestId('ready-to-assign-island').parentElement).toHaveClass('opacity-0');
  });

  it('takes the move surface away with it, so one screen is not covered by two', async () => {
    const user = setup();
    draw();

    await openMove(user);
    expect(screen.getByTestId('move-dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: ru['categories.manage'] }));
    await user.click(screen.getByRole('button', { name: ru['categories.edit'] }));

    expect(await screen.findByLabelText(ru['categories.nameLabel'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());
  });
});

describe('choosing the other envelope', () => {
  const openList = async (user: ReturnType<typeof setup>) => {
    await user.click(otherOf(POOL_ROW));
    await user.keyboard('{Enter}');

    return screen.findByPlaceholderText(ru['categories.moveSearch']);
  };

  it('narrows the envelopes to what the reader typed, and sends the one they pick', async () => {
    const user = setup();
    draw();

    await openMove(user);

    const seek = await openList(user);

    expect(screen.getAllByRole('option')).toHaveLength(2);

    await user.type(seek, 'транс');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));

    await user.click(screen.getByRole('option', { name: /Транспорт/ }));

    expect(action()).toHaveTextContent(ru['categories.moveSubmit']);

    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ from: category(FOOD), to: category(CAR) });
  });

  it('closes instead of swapping the far envelope when a re-read no longer carries it', async () => {
    move.mockImplementation(() => refused(500));
    const user = setup();
    draw();

    await openMove(user);

    const seek = await openList(user);

    await user.type(seek, 'транс');
    await user.click(await screen.findByRole('option', { name: /Транспорт/ }));
    await typeAmount(user, '150,00');

    const gone = monthOf();
    view = {
      ...gone,
      groups: gone.groups.map((group) => ({
        ...group,
        categories: group.categories.filter((one) => one.id !== CAR),
      })),
    };

    await submit(user);

    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());
    expect(move).toHaveBeenCalledTimes(1);
  });

  it('says so when the search matches nothing', async () => {
    const user = setup();
    draw();

    await openMove(user);

    const seek = await openList(user);
    await user.type(seek, 'ипотека');

    expect(await screen.findByText(ru['categories.moveNothing'])).toBeInTheDocument();
  });
});

describe('the key the move is written under', () => {
  it('writes under a key of its own', async () => {
    move.mockImplementation(() => new Promise(() => {}));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));

    const key = bodyOf(0).idempotencyKey;

    expect(typeof key).toBe('string');
    expect(key).not.toBe('');
  });

  it('writes once while a request is in flight, however many times the button is pressed', async () => {
    let land = (): void => {};
    move.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve({ month: '2026-08' });
        }),
    );
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');

    const button = action();

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(move).toHaveBeenCalledTimes(1);

    land();
  });

  it('mints a new key after a success, so the next move is a new operation', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });

  it('retries a lost request under the same key, because it may have arrived', async () => {
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await within(surface()).findByRole('alert');
    await user.click(within(notice).getByRole('button', { name: ru['categories.failRetry'] }));

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).idempotencyKey).toBe(bodyOf(0).idempotencyKey);
  });

  it('shows the refusal inside the popover, where the reader is looking', async () => {
    move.mockImplementation(() => refused(500));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await within(surface()).findByRole('alert');

    expect(notice).toHaveTextContent(ru['categories.failTitle']);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('keeps what was typed when the request never arrived, and freezes it until it is answered', async () => {
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await within(surface()).findByRole('alert');

    expect(within(notice).getByRole('button', { name: ru['categories.failRetry'] })).toBeEnabled();
    expect(amountFor('Продукты')).toHaveValue('150,00');
    expect(amountFor('Продукты')).toBeDisabled();
  });

  it('freezes the choice of envelope too, so a changed intent cannot go under the claimed key', async () => {
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    await within(surface()).findByRole('alert');

    expect(otherOf(POOL_ROW)).toBeDisabled();

    await submit(user);

    expect(move).toHaveBeenCalledTimes(1);
  });

  it('re-reads the month when an unretried request is thrown away, because it may have landed', async () => {
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    const notice = await within(surface()).findByRole('alert');

    const before = reads;
    view = monthOf({ assigned: '63000', available: '63000' });
    await user.click(within(notice).getByRole('button', { name: ru['categories.failCancel'] }));

    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.getByTestId('available-Продукты')).toHaveTextContent(/630,00/),
    );
  });

  it('writes nothing until that re-read lands', async () => {
    move.mockImplementationOnce(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    const notice = await within(surface()).findByRole('alert');

    let land = (): void => {};
    viewHolds = new Promise<void>((resolve) => {
      land = resolve;
    });
    await user.click(within(notice).getByRole('button', { name: ru['categories.failCancel'] }));

    await user.click(triggerOf());

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
    expect(move).toHaveBeenCalledTimes(1);

    viewHolds = null;
    land();
  });

  it('keeps the popover open with a new key when the server recorded a refusal', async () => {
    move.mockImplementation(() => refused(400, 'CATEGORY_HIDDEN'));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await within(surface()).findByRole('alert');

    expect(notice).toHaveTextContent(ru['categories.failOther']);
    expect(amountFor('Продукты')).toHaveValue('150,00');

    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(bodyOf(1).idempotencyKey).not.toBe(bodyOf(0).idempotencyKey);
  });

  it('says the same about a category the budget no longer holds', async () => {
    move.mockImplementation(() => refused(400, 'UNKNOWN_CATEGORY'));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    expect(await within(surface()).findByRole('alert')).toHaveTextContent(
      ru['categories.failOther'],
    );
  });

  it('says a key was already used with another amount, and offers nothing to press', async () => {
    move.mockImplementation(() => refused(409));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await within(surface()).findByRole('alert');

    expect(notice).toHaveTextContent(ru['categories.failConflict']);
    expect(within(notice).queryAllByRole('button')).toHaveLength(0);
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('closes the popover and sends the reader to the page when the active budget changed', async () => {
    move.mockImplementation(() => refused(400, 'NO_ACTIVE_BUDGET'));
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    const notice = await screen.findByRole('alert');

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
    expect(notice).toHaveTextContent(ru['categories.failBudget']);

    const before = reads;
    await user.click(within(notice).getByRole('button', { name: ru['categories.failRefresh'] }));

    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it('names the category that failed even when the popover was closed before the answer came', async () => {
    let refuse = (): void => {};
    move.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = () => reject({ statusCode: 500, error: 'Server', message: 'no' });
        }),
    );
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    await user.click(within(surface()).getByRole('button', { name: ru['categories.moveCancel'] }));

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();

    refuse();

    const notice = await screen.findByRole('alert');
    const tile = screen.getByTestId('available-Продукты').closest('[data-slot="category-tile"]');

    expect(notice).toHaveTextContent(ru['categories.failTitle']);
    await waitFor(() => expect(tile).toHaveAttribute('data-failed', 'true'));
  });

  it('refuses to open while the month on screen could not be re-read', async () => {
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);
    const notice = await within(surface()).findByRole('alert');

    viewFails = true;
    await user.click(within(notice).getByRole('button', { name: ru['categories.failCancel'] }));
    await waitFor(() => expect(screen.getByText(ru['categories.unavailable'])).toBeInTheDocument());

    move.mockClear();
    await user.click(triggerOf());

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
  });
});

describe('what the screen believes afterwards', () => {
  it('closes the popover and shows what the api answered, not what the browser worked out', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');

    view = { ...monthOf({ assigned: '99900', available: '99900' }), readyToAssign: '11100' };
    await submit(user);

    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('available-Продукты')).toHaveTextContent(/999,00/),
    );
    expect(screen.getByTestId('ready-to-assign')).toHaveTextContent(/111,00/);
  });

  it('leaves the tile alone until the answer arrives', async () => {
    let land = (): void => {};
    move.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve({ month: '2026-08' });
        }),
    );
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await submit(user);

    expect(screen.getByTestId('available-Продукты')).toHaveTextContent(/480,00/);

    land();
  });
});

describe('the keyboard', () => {
  it('sends the move on Enter', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
  });

  it('closes the popover on Escape without writing anything', async () => {
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150,00');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument());
    expect(move).not.toHaveBeenCalled();
  });
});

describe('on a phone', () => {
  it('moves the money in the drawer rather than in a popover', async () => {
    window.innerWidth = 390;
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(triggerOf());

    const drawer = await screen.findByRole('dialog');

    expect(
      within(drawer).getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', 'Продукты'),
      ),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: ru['categories.moveSubmit'] }),
    ).toBeInTheDocument();
  });

  it('shows a refusal inside the drawer, where the reader can reach it', async () => {
    window.innerWidth = 390;
    move.mockImplementation(lost);
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(triggerOf());

    const drawer = await screen.findByRole('dialog');
    await user.clear(
      within(drawer).getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', 'Продукты'),
      ),
    );
    await user.type(
      within(drawer).getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', 'Продукты'),
      ),
      '150,00',
    );
    await user.click(within(drawer).getByRole('button', { name: ru['categories.moveSubmit'] }));

    const notice = await within(drawer).findByRole('alert');

    expect(notice).toHaveTextContent(ru['categories.failTitle']);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('on a phone, when the category itself goes away', () => {
  it('closes the sheet and says on the page that the move was refused', async () => {
    window.innerWidth = 390;
    move.mockImplementation(() => refused(400, 'CATEGORY_HIDDEN'));
    const user = setup();
    draw();

    await screen.findByText('Продукты');
    await user.click(triggerOf());

    const drawer = await screen.findByRole('dialog');
    await user.clear(
      within(drawer).getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', 'Продукты'),
      ),
    );
    await user.type(
      within(drawer).getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', 'Продукты'),
      ),
      '150,00',
    );

    view = {
      month: '2026-08',
      readyToAssign: '85000',
      groups: [
        {
          id: 'g1',
          name: 'Повседневные расходы',
          categories: [
            {
              id: CAR,
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
    };

    await user.click(within(drawer).getByRole('button', { name: ru['categories.moveSubmit'] }));

    const notice = await screen.findByRole('alert');

    expect(notice).toHaveTextContent(ru['categories.failOther']);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('a currency that is not counted in hundredths', () => {
  it('reads and sends what was typed as whole units', async () => {
    budget = { ...budget, currency: 'JPY', minorDigits: 0 };
    view = {
      month: '2026-08',
      readyToAssign: '850',
      groups: [
        {
          id: 'g1',
          name: 'Повседневные расходы',
          categories: [
            {
              id: FOOD,
              name: 'Продукты',
              icon: 'shopping-cart',
              color: 'green',
              assigned: '480',
              activity: '0',
              available: '480',
            },
          ],
        },
      ],
    };
    const user = setup();
    draw();

    await openMove(user);
    await typeAmount(user, '150');
    await submit(user);

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ amount: '150' });
  });

  it('shows what an envelope holds at the same digit count', async () => {
    budget = { ...budget, currency: 'JPY', minorDigits: 0 };
    view = {
      month: '2026-08',
      readyToAssign: '850',
      groups: [
        {
          id: 'g1',
          name: 'Повседневные расходы',
          categories: [
            {
              id: FOOD,
              name: 'Продукты',
              icon: 'shopping-cart',
              color: 'green',
              assigned: '480',
              activity: '0',
              available: '480',
            },
          ],
        },
      ],
    };
    const user = setup();
    draw();

    await openMove(user);

    expect(surface()).toHaveTextContent(/850/);
    expect(surface()).not.toHaveTextContent(/8,50/);
  });
});
