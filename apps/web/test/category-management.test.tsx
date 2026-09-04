import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BudgetMonth } from '@/components/budget-month';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const createCategory = jest.fn();
const updateCategory = jest.fn();
const hideCategory = jest.fn();
const hideGroup = jest.fn();
const createGroup = jest.fn();
const editGroup = jest.fn();
const move = jest.fn();
const reorderGroups = jest.fn();

let hideRefuses = false;

const budget = {
  id: 'b1',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  active: true,
};

const HOME = '0199c1a8-9ecf-71c7-a617-c575df073700';
const FUN = '0199c1a8-9ecf-71c7-a617-c575df073701';

const view = {
  month: '2026-08',
  readyToAssign: '85000',
  groups: [
    {
      id: 'g1',
      name: 'Дом',
      hidden: false,
      paid: false,
      categories: [
        {
          id: HOME,
          name: 'Аренда',
          icon: 'home',
          color: 'blue',
          assigned: '48000',
          activity: '0',
          available: '48000',
          availableAllTime: '48000',
          hidden: false,
          paid: false,
        },
      ],
    },
    {
      id: 'g2',
      name: 'Досуг',
      hidden: false,
      paid: false,
      categories: [
        {
          id: FUN,
          name: 'Кино',
          icon: 'movie',
          color: 'violet',
          assigned: '0',
          activity: '0',
          available: '0',
          availableAllTime: '0',
          hidden: false,
          paid: false,
        },
      ],
    },
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
  categoriesControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => createCategory(options) as unknown,
  }),
  categoriesControllerUpdateMutation: () => ({
    mutationFn: (options: unknown) => updateCategory(options) as unknown,
  }),
  categoriesControllerHideMutation: () => ({
    mutationFn: (options: unknown) => {
      hideCategory(options);

      return hideRefuses
        ? Promise.reject({ statusCode: 400, reason: 'AVAILABLE_NOT_ZERO' })
        : Promise.resolve({});
    },
  }),
  categoriesControllerReorderMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryGroupsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => createGroup(options) as unknown,
  }),
  categoryGroupsControllerUpdateMutation: () => ({
    mutationFn: (options: unknown) => editGroup(options) as unknown,
  }),
  categoryGroupsControllerHideMutation: () => ({
    mutationFn: (options: unknown) => hideGroup(options) as unknown,
  }),
  categoryGroupsControllerReorderMutation: () => ({
    mutationFn: (options: unknown) => reorderGroups(options) as unknown,
  }),
  categoryPaidControllerMarkMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryPaidControllerUnmarkMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  movesControllerMoveMutation: () => ({
    mutationFn: (options: unknown) => move(options) as unknown,
  }),
  categoryTargetsControllerSetMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
  categoryTargetsControllerCloseMutation: () => ({ mutationFn: () => Promise.resolve({}) }),
}));

const draw = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <BudgetMonth />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const openTheActions = async (user: ReturnType<typeof userEvent.setup>, category = 'Аренда') => {
  await screen.findByText(category);
  await user.click(
    screen.getByRole('button', {
      name: en['categories.moveOpen'].replace('{{category}}', category),
    }),
  );
  await user.click(await screen.findByRole('button', { name: en['categories.manage'] }));
};

afterEach(() => {
  jest.clearAllMocks();
  hideRefuses = false;
});

describe('setting up a category from the month', () => {
  it('creates one in the group whose plus was pressed', async () => {
    const user = userEvent.setup();
    draw();

    await screen.findByText('Досуг');
    await user.click(
      screen.getByRole('button', { name: en['categories.addTo'].replace('{{group}}', 'Досуг') }),
    );

    await user.type(await screen.findByLabelText(en['categories.nameLabel']), 'Концерты');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
    expect(createCategory.mock.calls[0]?.[0]).toMatchObject({
      body: { groupId: 'g2', name: 'Концерты' },
    });
  });

  it('edits the one whose actions were opened, and carries its group with it', async () => {
    const user = userEvent.setup();
    draw();

    await openTheActions(user);
    await user.click(screen.getByRole('button', { name: en['categories.edit'] }));

    const field = await screen.findByLabelText(en['categories.nameLabel']);
    await user.clear(field);
    await user.type(field, 'Квартира');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
    expect(updateCategory.mock.calls[0]?.[0]).toMatchObject({
      path: { id: HOME },
      body: { name: 'Квартира', groupId: 'g1' },
    });
  });
});

describe('the groups themselves', () => {
  it('offers to add one under the list, on a month that already has some', async () => {
    const user = userEvent.setup();
    draw();

    await screen.findByText('Дом');
    await user.click(screen.getByRole('button', { name: en['categories.addGroup'] }));

    await user.type(await screen.findByLabelText(en['categories.nameLabel']), 'Отпуск');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    await waitFor(() => expect(createGroup).toHaveBeenCalledTimes(1));
    expect(createGroup.mock.calls[0]?.[0]).toMatchObject({ body: { name: 'Отпуск' } });
  });

  it('renames one from its own header, with the name already in the field', async () => {
    const user = userEvent.setup();
    draw();

    await screen.findByText('Досуг');
    await user.click(
      screen.getByRole('button', {
        name: en['categories.renameGroup'].replace('{{group}}', 'Досуг'),
      }),
    );

    const field = await screen.findByLabelText(en['categories.nameLabel']);
    expect(field).toHaveValue('Досуг');

    await user.clear(field);
    await user.type(field, 'Развлечения');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    await waitFor(() => expect(editGroup).toHaveBeenCalledTimes(1));
    expect(editGroup.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'g2' },
      body: { name: 'Развлечения' },
    });
  });
});

describe('hiding from the month', () => {
  it('frees the whole remainder into the pool in one press, and stays open', async () => {
    const user = userEvent.setup();
    draw();

    await openTheActions(user);
    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));

    await user.click(await screen.findByRole('button', { name: en['categories.release'] }));

    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(move.mock.calls[0]?.[0]).toMatchObject({
      body: {
        amount: '48000',
        from: { kind: 'CATEGORY', categoryId: HOME },
        to: { kind: 'READY_TO_ASSIGN' },
      },
    });
    expect(hideCategory).not.toHaveBeenCalled();
    expect(screen.getByTestId('hide-total')).toBeInTheDocument();
  });

  it('hides one that holds nothing, without asking for a move first', async () => {
    const user = userEvent.setup();
    draw();

    await openTheActions(user, 'Кино');
    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));

    expect(
      screen.queryByRole('button', { name: en['categories.release'] }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));

    await waitFor(() => expect(hideCategory).toHaveBeenCalledTimes(1));
    expect(hideCategory.mock.calls[0]?.[0]).toMatchObject({ path: { id: FUN } });
  });

  it('says why the server refused instead of closing on silence', async () => {
    hideRefuses = true;
    const user = userEvent.setup();
    draw();

    await openTheActions(user, 'Кино');
    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));
    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['categories.hideBlocked']);
  });

  it('opens the group dialog from the eye, listing what still holds money', async () => {
    const user = userEvent.setup();
    draw();

    await screen.findByText('Дом');
    await user.click(
      screen.getByRole('button', {
        name: en['categories.hideGroupTitle'].replace('{{group}}', 'Дом'),
      }),
    );

    expect(await screen.findByTestId(`group-status-${HOME}`)).toHaveAttribute(
      'data-state',
      'blocked',
    );
    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
    expect(hideGroup).not.toHaveBeenCalled();
  });
});
