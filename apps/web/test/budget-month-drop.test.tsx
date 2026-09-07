import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';

import { BudgetMonth } from '@/components/budget-month';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

import type * as DndKit from '@dnd-kit/core';
import type { DndContextProps, DragEndEvent } from '@dnd-kit/core';

const mockDragEnds = new Map<symbol, ((event: DragEndEvent) => void) | undefined>();

jest.mock('@dnd-kit/core', () => {
  const actual: typeof DndKit = jest.requireActual('@dnd-kit/core');

  function Recording(props: DndContextProps) {
    const id = useRef(Symbol('dnd'));
    mockDragEnds.set(id.current, props.onDragEnd);

    useEffect(() => {
      const key = id.current;

      return () => {
        mockDragEnds.delete(key);
      };
    }, []);

    return <actual.DndContext {...props} />;
  }

  return { ...actual, DndContext: Recording };
});

const reorderGroups = jest.fn();
const reorderCategories = jest.fn();
const unmarkPaid = jest.fn();

const budget = {
  id: 'b1',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

const category = (id: string, name: string, paid = false) => ({
  id,
  name,
  icon: 'home',
  color: 'blue',
  assigned: '1000',
  activity: '0',
  available: '1000',
  availableAllTime: '1000',
  hidden: false,
  paid,
  target: null,
});

const view = {
  month: '2026-08',
  readyToAssign: '85000',
  groups: [
    {
      id: 'g1',
      name: 'Дом',
      hidden: false,
      categories: [category('c1', 'Аренда', true), category('c2', 'Свет'), category('c3', 'Вода')],
    },
    { id: 'g2', name: 'Досуг', hidden: false, categories: [category('c4', 'Кино')] },
  ],
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/categories',
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: [{ _id: 'budgetsControllerList', baseUrl: 'http://api' }],
    queryFn: () => Promise.resolve([budget]),
  }),
  budgetViewControllerReadOptions: ({ query }: { query: { month: string } }) => ({
    queryKey: [{ _id: 'budgetViewControllerRead', baseUrl: 'http://api', query }],
    queryFn: () => Promise.resolve({ ...view, month: query.month }),
  }),
  budgetViewControllerReadQueryKey: ({ query }: { query: { month: string } }) => [
    { _id: 'budgetViewControllerRead', baseUrl: 'http://api', query },
  ],
  categoriesControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerHideMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoriesControllerReorderMutation: () => ({
    mutationFn: (options: unknown) => reorderCategories(options) as unknown,
  }),
  categoryGroupsControllerCreateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerUpdateMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerHideMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerReorderMutation: () => ({
    mutationFn: (options: unknown) => reorderGroups(options) as unknown,
  }),
  categoryPaidControllerMarkMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryPaidControllerUnmarkMutation: () => ({
    mutationFn: (options: unknown) => unmarkPaid(options) as unknown,
  }),
  movesControllerMoveMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryTargetsControllerSetMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryTargetsControllerCloseMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
}));

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

const drop = (activeId: string, overId: string): void => {
  const event = {
    active: { id: activeId },
    over: { id: overId },
  } as unknown as DragEndEvent;

  act(() => {
    for (const handler of mockDragEnds.values()) {
      handler?.(event);
    }
  });
};

const names = () => screen.getAllByTestId('category-name').map((one) => one.textContent);

const groupNames = () =>
  screen
    .getAllByRole('button', {
      name: new RegExp(`^${ru['categories.groupToggle'].split('{{group}}')[0] ?? ''}`),
    })
    .map((one) => one.textContent);

beforeEach(() => {
  jest.clearAllMocks();
  mockDragEnds.clear();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  jest.useFakeTimers({ advanceTimers: true }).setSystemTime(new Date('2026-08-15T12:00:00Z'));
  reorderGroups.mockResolvedValue([]);
  reorderCategories.mockResolvedValue([]);
  unmarkPaid.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a group dropped onto another', () => {
  it('is shown in its new place at once and the order is sent as the drop left it', async () => {
    draw();
    await screen.findByText('Кино');
    expect(groupNames()).toEqual(['Дом', 'Досуг']);

    drop('g2', 'g1');

    expect(groupNames()).toEqual(['Досуг', 'Дом']);
    await waitFor(() => expect(reorderGroups).toHaveBeenCalledTimes(1));
    expect(reorderGroups.mock.calls[0]?.[0]).toMatchObject({ body: { groupIds: ['g2', 'g1'] } });
  });

  it('says the save failed when the server refuses the new order', async () => {
    reorderGroups.mockRejectedValue({ statusCode: 500 });
    draw();
    await screen.findByText('Кино');

    drop('g2', 'g1');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['categories.failTitle']);
  });

  it('ignores a drop that names no group, and one that lands on itself', async () => {
    draw();
    await screen.findByText('Кино');

    drop('g1', 'g1');
    drop('nope', 'g1');

    expect(groupNames()).toEqual(['Дом', 'Досуг']);
    expect(reorderGroups).not.toHaveBeenCalled();
  });
});

describe('a category dropped in a group with a closed card', () => {
  it('keeps the closed card in its stored slot and permutes only the open ones', async () => {
    draw();
    await screen.findByText('Кино');
    expect(names().slice(0, 3)).toEqual(['Свет', 'Вода', 'Аренда']);

    drop('c2', 'c3');

    expect(names().slice(0, 3)).toEqual(['Вода', 'Свет', 'Аренда']);
    await waitFor(() => expect(reorderCategories).toHaveBeenCalledTimes(1));
    expect(reorderCategories.mock.calls[0]?.[0]).toMatchObject({
      body: { groupId: 'g1', categoryIds: ['c1', 'c3', 'c2'] },
    });
  });
});

describe('reopening a closed card that the server refuses', () => {
  it('shows the failure and leaves the card closed', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    unmarkPaid.mockRejectedValue({ statusCode: 500 });
    draw();

    await user.click(
      await screen.findByRole('button', {
        name: ru['categories.moveOpen'].replace('{{category}}', 'Аренда'),
      }),
    );
    await user.click(screen.getByRole('button', { name: ru['categories.paidReopen'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['categories.failTitle']);
    expect(screen.getByTestId('category-tile-Аренда')).toHaveAttribute('data-paid', 'true');
  });
});
