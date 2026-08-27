import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BudgetMonth } from '@/components/budget-month';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

const move = jest.fn();
const push = jest.fn();
const replace = jest.fn();

let search = '';
let budget: {
  id: string;
  currency: string;
  minorDigits: number;
  timezone: string;
  firstMonth: string;
  active: boolean;
} | null = null;
let view: unknown = null;
let viewFails = false;
let reads = 0;

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (href: string, options?: unknown) => push(href, options) as unknown,
    replace: (href: string) => replace(href) as unknown,
  }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/categories',
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve(budget === null ? [] : [budget]),
  }),
  budgetViewControllerReadOptions: ({ query }: { query: { month: string } }) => ({
    queryKey: [{ _id: 'budgetViewControllerRead', baseUrl: 'http://api', query }],
    queryFn: () => {
      reads += 1;
      if (viewFails) throw new Error('the api was unreachable');

      return Promise.resolve(view);
    },
  }),
  budgetViewControllerReadQueryKey: ({ query }: { query: { month: string } }) => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api', query },
  ],
  movesControllerMoveMutation: () => ({
    mutationFn: (options: unknown) => move(options) as unknown,
  }),
}));

const category = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Продукты',
  icon: 'cart',
  color: 'green',
  assigned: '22000',
  activity: '-14860',
  available: '7660',
  ...over,
});

const oneCategory = (over: Record<string, unknown> = {}) => ({
  month: '2026-08',
  readyToAssign: '85000',
  groups: [{ id: 'g1', name: 'Повседневные расходы', categories: [category(over)] }],
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

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  jest.useFakeTimers({ advanceTimers: true }).setSystemTime(new Date('2026-08-15T12:00:00Z'));
  search = '';
  reads = 0;
  viewFails = false;
  budget = {
    id: 'b1',
    currency: 'PLN',
    minorDigits: 2,
    timezone: 'Europe/Warsaw',
    firstMonth: '2026-06',
    active: true,
  };
  view = oneCategory();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the month of the budget', () => {
  it('shows the groups, their categories and the four numbers of each tile', async () => {
    draw();

    expect(await screen.findByText('Повседневные расходы')).toBeInTheDocument();

    const tile = (await screen.findByText('Продукты')).closest('[data-slot="category-tile"]');
    expect(tile).not.toBeNull();

    const shown = within(tile as HTMLElement);
    expect(shown.getByTestId('available-Продукты')).toHaveTextContent(/76,60/);
    expect(shown.getByText(/220,00/)).toBeInTheDocument();
    expect(shown.getByText(/148,60/)).toBeInTheDocument();
    expect(shown.getByText(ru['categories.spent'])).toBeInTheDocument();
  });

  it('shows what has no job yet, and says which of its three states that is', async () => {
    draw();

    expect(await screen.findByTestId('ready-to-assign')).toHaveTextContent(/850,00/);
    expect(screen.getByText(ru['categories.readyToAssignFree'])).toBeInTheDocument();
  });

  it('says everything is assigned when nothing is free', async () => {
    view = { ...oneCategory(), readyToAssign: '0' };
    draw();

    expect(await screen.findByText(ru['categories.readyToAssignDone'])).toBeInTheDocument();
  });

  it('says more is assigned than exists when the pool went below zero', async () => {
    view = { ...oneCategory(), readyToAssign: '-31000' };
    draw();

    expect(await screen.findByText(ru['categories.readyToAssignOver'])).toBeInTheDocument();
  });

  it('shows only this month assignment, so a carryover reads as zero beside what is available', async () => {
    view = oneCategory({ name: 'Здоровье', assigned: '0', activity: '0', available: '60000' });
    draw();

    const tile = (await screen.findByText('Здоровье')).closest('[data-slot="category-tile"]');
    const shown = within(tile as HTMLElement);

    expect(shown.getByTestId('available-Здоровье')).toHaveTextContent(/600,00/);
    expect(
      shown.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Здоровье'),
      }),
    ).toHaveTextContent(/^0,00/);
  });

  it('renders every amount at the digit count the budget was frozen at', async () => {
    budget = { ...budget!, currency: 'JPY', minorDigits: 0 };
    view = {
      month: '2026-08',
      readyToAssign: '850',
      groups: [
        {
          id: 'g1',
          name: 'Повседневные расходы',
          categories: [category({ assigned: '220', activity: '-148', available: '76' })],
        },
      ],
    };
    draw();

    const rta = await screen.findByTestId('ready-to-assign');

    expect(rta).toHaveTextContent(/850/);
    expect(rta).not.toHaveTextContent(/850,00/);
    expect(rta).not.toHaveTextContent(/8,50/);
  });

  it('folds a group away and back', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    draw();

    expect(await screen.findByText('Продукты')).toBeVisible();

    const toggle = screen.getByRole('button', {
      name: /Повседневные расходы/,
    });

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
  });

  it('adds up what a group holds from what its categories hold, negatives included', async () => {
    view = {
      month: '2026-08',
      readyToAssign: '0',
      groups: [
        {
          id: 'g1',
          name: 'Повседневные расходы',
          categories: [
            category({ id: 'c1', name: 'Продукты', available: '20000', assigned: '5000' }),
            category({ id: 'c2', name: 'Транспорт', available: '-7200', assigned: '3000' }),
          ],
        },
      ],
    };
    draw();

    const header = await screen.findByTestId('group-total-g1');

    expect(header).toHaveTextContent(/128,00/);
  });

  it('says the budget holds no categories rather than drawing an empty grid', async () => {
    view = { month: '2026-08', readyToAssign: '0', groups: [] };
    draw();

    expect(await screen.findByText(ru['categories.emptyTitle'])).toBeInTheDocument();
  });

  it('says the month could not be read rather than showing an empty month', async () => {
    viewFails = true;
    draw();

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['categories.unavailable']);
  });

  it('draws a category nobody gave a look with something rather than an empty ring', async () => {
    view = oneCategory({ icon: null, color: null });
    draw();

    const tile = (await screen.findByText('Продукты')).closest('[data-slot="category-tile"]');

    expect(within(tile as HTMLElement).getByTestId('category-icon')).toBeInTheDocument();
  });
});

describe('moving between months', () => {
  it('reads the month written in the address', async () => {
    search = 'month=2026-09';
    view = { ...oneCategory(), month: '2026-09' };
    draw();

    await screen.findByText('Продукты');

    expect(screen.getByText(/сентябрь 2026/i)).toBeInTheDocument();
  });

  it('falls back to this month in the budget timezone when the address carries none', async () => {
    draw();

    expect(await screen.findByText(/август 2026/i)).toBeInTheDocument();
  });

  it('puts the month into history without navigating, so going back returns and the page stays put', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const pushState = jest.spyOn(window.history, 'pushState');
    draw();

    await screen.findByText('Продукты');
    await user.click(screen.getByRole('button', { name: ru['categories.nextMonth'] }));

    expect(pushState).toHaveBeenCalledWith(null, '', '/categories?month=2026-09');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    pushState.mockRestore();
  });

  it('does not write the month into the address until the reader moves', async () => {
    draw();

    await screen.findByText('Продукты');

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('asks the api for the month the address names', async () => {
    search = 'month=2026-09';
    view = { ...oneCategory(), month: '2026-09' };
    draw();

    await screen.findByText('Продукты');

    expect(reads).toBeGreaterThan(0);
  });

  it('keeps the month it has while the next one loads, and says which way it is going', async () => {
    search = 'month=2026-09';
    view = { ...oneCategory(), month: '2026-08' };
    draw();

    await screen.findByText('Продукты');

    expect(screen.getByText(/август 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru['categories.nextMonth'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: ru['categories.previousMonth'] })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('refuses to assign while the month on screen is not the month being asked for', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    search = 'month=2026-09';
    view = { ...oneCategory(), month: '2026-08' };
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    expect(screen.queryByLabelText(ru['categories.assignField'])).not.toBeInTheDocument();
  });

  it('refuses to write from a field opened before the address moved to another month', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    draw();

    await screen.findByText('Продукты');
    await user.click(
      screen.getByRole('button', {
        name: ru['categories.assignEdit'].replace('{{category}}', 'Продукты'),
      }),
    );

    const field = screen.getByLabelText(ru['categories.assignField']);

    search = 'month=2026-09';
    await user.clear(field);
    await user.type(field, '600,00');
    await user.click(screen.getByRole('button', { name: ru['categories.assignSave'] }));

    expect(screen.getByText(/август 2026/i)).toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
  });

  it('stops at the month the budget was created in, since nothing precedes it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    search = 'month=2026-06';
    view = { ...oneCategory(), month: '2026-06' };
    draw();

    await screen.findByText('Продукты');
    const back = screen.getByRole('button', { name: ru['categories.previousMonth'] });

    expect(back).toBeDisabled();

    await user.click(back);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the first month when the address asks for one before the budget existed', async () => {
    search = 'month=2026-01';
    view = { ...oneCategory(), month: '2026-06' };
    draw();

    expect(await screen.findByText(/июнь 2026/i)).toBeInTheDocument();
  });

  it('marks a month later than today, reading today in the budget timezone', async () => {
    search = 'month=2026-09';
    view = { ...oneCategory(), month: '2026-09' };
    draw();

    expect(await screen.findByText(ru['categories.futureMonth'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru['categories.today'] })).toBeInTheDocument();
  });

  it('does not mark the current month as future when the host clock is a day ahead', async () => {
    jest.setSystemTime(new Date('2026-08-31T23:30:00Z'));
    search = 'month=2026-08';
    draw();

    await screen.findByText('Продукты');

    expect(screen.queryByText(ru['categories.futureMonth'])).not.toBeInTheDocument();
  });
});
