import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BudgetSection } from '@/components/budget-section';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

interface Budget {
  id: string;
  name: string;
  currency: string;
  minorDigits: number;
  timezone: string;
  firstMonth: string;
  createdOn: string;
  active: boolean;
}

const budget = (over: Partial<Budget>): Budget => ({
  id: 'budget-1',
  name: 'Household',
  currency: 'PLN',
  minorDigits: 2,
  timezone: 'Europe/Warsaw',
  firstMonth: '2026-01',
  createdOn: '2026-01-15',
  active: true,
  ...over,
});

let budgets: Budget[] = [];
let listGate: Promise<void> | null = null;

const renames = jest.fn<Promise<Budget>, [string, { name: string; idempotencyKey: string }]>();
const activates = jest.fn<Promise<Budget>, [string, string]>();
jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: async () => {
      if (listGate !== null) await listGate;

      return budgets.map((each) => ({ ...each }));
    },
  }),
  budgetsControllerListQueryKey: () => ['budgetsControllerList'],
  userSettingsControllerReadQueryKey: () => ['userSettingsControllerRead'],
  accountsControllerListQueryKey: () => ['accountsControllerList'],
  accountsControllerListOptions: () => ({
    queryKey: ['accountsControllerList'],
    queryFn: () => Promise.resolve({ accounts: [], total: '0' }),
  }),
  budgetsControllerRenameMutation: () => ({
    mutationFn: ({
      path,
      body,
    }: {
      path: { id: string };
      body: { name: string; idempotencyKey: string };
    }) => renames(path.id, body),
  }),
  budgetsControllerActivateMutation: () => ({
    mutationFn: ({ path, body }: { path: { id: string }; body: { idempotencyKey: string } }) =>
      activates(path.id, body.idempotencyKey),
  }),
}));

const refused = (statusCode: number) => Object.assign(new Error('refused'), { statusCode });

let client: QueryClient;

const draw = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="en">
        <BudgetSection />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const nameField = () => screen.findByRole('textbox', { name: en['settings.budgetName'] });
const save = () => screen.getByRole('button', { name: en['settings.budgetSave'] });
const list = () => screen.getByRole('list', { name: en['settings.budgets'] });
const switchTo = (name: string) =>
  screen.getByRole('radio', {
    name: interpolate(en['settings.budgetActivateNamed'], { name }),
  });
const activeMark = (name: string) =>
  screen.getByRole('radio', {
    name: interpolate(en['settings.budgetActiveNamed'], { name }),
  });

const confirmButton = () =>
  screen.findByRole('button', { name: en['settings.budgetSwitchConfirm'] });
const cancelButton = () => screen.findByRole('button', { name: en['settings.budgetSwitchCancel'] });

const choose = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(switchTo(name));
  await user.click(await confirmButton());
};

const retype = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const field = await nameField();
  await user.clear(field);
  await user.type(field, name);
};

const keyOfRename = (call: number): string | undefined =>
  renames.mock.calls[call]?.[1].idempotencyKey;
const keyOfSwitch = (call: number): string | undefined => activates.mock.calls[call]?.[1];

describe('the budget section of settings', () => {
  beforeEach(() => {
    budgets = [
      budget({ id: 'budget-1', name: 'Household', active: true }),
      budget({ id: 'budget-2', name: 'Trip', currency: 'EUR', active: false }),
    ];
    listGate = null;
    renames.mockReset();
    renames.mockImplementation((id, body) => {
      budgets = budgets.map((each) => (each.id === id ? { ...each, name: body.name } : each));

      return Promise.resolve(budget({ id, name: body.name }));
    });
    activates.mockReset();
    activates.mockImplementation((id) => {
      budgets = budgets.map((each) => ({ ...each, active: each.id === id }));

      return Promise.resolve(budget({ id, active: true }));
    });
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
  });

  describe('about the active budget', () => {
    it('shows the name of the budget the screens follow, ready to be changed', async () => {
      draw();

      expect(await nameField()).toHaveValue('Household');
    });

    it('shows the currency in a field that is closed, so it reads as chosen and not as a choice', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      const currency = screen.getByRole('combobox', { name: en['settings.budgetCurrency'] });

      expect(currency).toHaveTextContent(
        `PLN · ${new Intl.DisplayNames(['en'], { type: 'currency' }).of('PLN') ?? ''}`,
      );
      expect(currency).toBeDisabled();

      await user.click(currency);

      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
    });

    it('keeps save closed until the name differs from the stored one and is not blank', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      expect(save()).toBeDisabled();

      await retype(user, '   ');
      expect(save()).toBeDisabled();

      await retype(user, 'Household');
      expect(save()).toBeDisabled();

      await retype(user, 'Family');
      expect(save()).toBeEnabled();
    });

    it('sends the new name, trimmed, for the active budget', async () => {
      const user = userEvent.setup();
      draw();

      await retype(user, '  Family  ');
      await user.click(save());

      await waitFor(() => expect(renames).toHaveBeenCalledTimes(1));
      expect(renames).toHaveBeenCalledWith('budget-1', {
        name: 'Family',
        idempotencyKey: expect.any(String) as string,
      });
      await waitFor(() => expect(within(list()).getByText('Family')).toBeInTheDocument());
    });

    it('swallows a second click instead of sending the rename twice', async () => {
      const user = userEvent.setup();
      renames.mockReturnValue(new Promise(() => {}));
      draw();

      await retype(user, 'Family');
      await user.dblClick(save());

      await waitFor(() => expect(renames).toHaveBeenCalledTimes(1));
      expect(save()).toBeDisabled();
    });

    it('sends the next rename under a key of its own', async () => {
      const user = userEvent.setup();
      draw();

      await retype(user, 'Family');
      await user.click(save());
      await waitFor(() => expect(renames).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(within(list()).getByText('Family')).toBeInTheDocument());

      await retype(user, 'Home');
      await user.click(save());
      await waitFor(() => expect(renames).toHaveBeenCalledTimes(2));

      expect(keyOfRename(1)).not.toBe(keyOfRename(0));
    });

    it('says the save failed, keeps what was typed and leaves the stored name alone', async () => {
      const user = userEvent.setup();
      renames.mockRejectedValue(refused(500));
      draw();

      await retype(user, 'Family');
      await user.click(save());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(en['settings.budgetFailedTitle']);
      expect(alert).toHaveTextContent(en['settings.budgetFailed']);
      expect(await nameField()).toHaveValue('Family');
      expect(within(list()).getByText('Household')).toBeInTheDocument();
      expect(within(list()).queryByText('Family')).not.toBeInTheDocument();
    });

    it('keeps what is typed after a save while the list is still being re-read', async () => {
      const user = userEvent.setup();
      draw();

      await retype(user, 'Family');
      let land = () => {};
      listGate = new Promise((resolve) => {
        land = resolve;
      });
      await user.click(save());
      await waitFor(() => expect(renames).toHaveBeenCalledTimes(1));

      await user.type(await nameField(), ' budget');
      land();

      await waitFor(() => expect(within(list()).getByText('Family')).toBeInTheDocument());
      expect(await nameField()).toHaveValue('Family budget');
      expect(save()).toBeEnabled();
    });

    it('retries a lost request under the same key', async () => {
      const user = userEvent.setup();
      renames.mockRejectedValue(new Error('network'));
      draw();

      await retype(user, 'Family');
      await user.click(save());
      await screen.findByRole('alert');
      await user.click(save());

      await waitFor(() => expect(renames).toHaveBeenCalledTimes(2));
      expect(keyOfRename(1)).toBe(keyOfRename(0));
    });

    it('mints a new key once the name is edited after a lost request', async () => {
      const user = userEvent.setup();
      renames.mockRejectedValue(new Error('network'));
      draw();

      await retype(user, 'Family');
      await user.click(save());
      await screen.findByRole('alert');

      await retype(user, 'Home');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(save());

      await waitFor(() => expect(renames).toHaveBeenCalledTimes(2));
      expect(keyOfRename(1)).not.toBe(keyOfRename(0));
    });

    it('mints a new key once the server refused the first one', async () => {
      const user = userEvent.setup();
      renames.mockRejectedValue(refused(409));
      draw();

      await retype(user, 'Family');
      await user.click(save());
      await screen.findByRole('alert');
      await user.click(save());

      await waitFor(() => expect(renames).toHaveBeenCalledTimes(2));
      expect(keyOfRename(1)).not.toBe(keyOfRename(0));
    });
  });

  describe('the list of budgets', () => {
    it('lists every budget in the order the server answered, with the active one checked', async () => {
      budgets = [
        budget({ id: 'budget-1', name: 'Household', active: false }),
        budget({ id: 'budget-2', name: 'Trip', currency: 'EUR', active: true }),
        budget({ id: 'budget-3', name: 'Business', currency: 'USD', active: false }),
      ];
      draw();
      await nameField();

      const rows = within(list()).getAllByRole('listitem');

      expect(rows.map((row) => within(row).getByTestId('budget-row-name').textContent)).toEqual([
        'Household',
        'Trip',
        'Business',
      ]);
      expect(
        rows.map((row) => within(row).getByRole('radio').getAttribute('aria-checked')),
      ).toEqual(['false', 'true', 'false']);
      expect(within(rows[2] as HTMLElement).getByText('USD')).toBeInTheDocument();
    });

    it('says under each name the day that budget was created, and nothing else', async () => {
      budgets = [
        budget({ id: 'budget-1', name: 'Household', createdOn: '2026-01-05', active: true }),
        budget({ id: 'budget-2', name: 'Trip', createdOn: '2026-10-11', active: false }),
      ];
      draw();
      await nameField();

      const rows = within(list()).getAllByRole('listitem');

      expect(rows.map((row) => within(row).getByTestId('budget-row-created').textContent)).toEqual([
        '05.01.2026',
        '11.10.2026',
      ]);
    });

    it('puts the mark before the name, and offers no button to switch with', async () => {
      draw();
      await nameField();

      const [row] = within(list()).getAllByRole('listitem');
      const mark = within(row as HTMLElement).getByRole('radio');
      const name = within(row as HTMLElement).getByTestId('budget-row-name');

      expect(mark.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(list()).queryByRole('button')).not.toBeInTheDocument();
      expect(activeMark('Household')).toBeChecked();
      expect(switchTo('Trip')).not.toBeChecked();
    });

    it('says what a mark does when it is pointed at', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await user.hover(switchTo('Trip'));

      expect(await screen.findByText(en['settings.budgetActivate'])).toBeInTheDocument();
    });

    it('leaves the active budget active when its own mark is pressed', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await user.click(activeMark('Household'));

      expect(activates).not.toHaveBeenCalled();
      expect(activeMark('Household')).toBeChecked();
    });

    it('switches to the chosen budget in place, and the screen follows it without a page load', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await choose(user, 'Trip');

      await waitFor(() => expect(activates).toHaveBeenCalledTimes(1));
      expect(activates).toHaveBeenCalledWith('budget-2', expect.any(String));
      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      expect(switchTo('Household')).not.toBeChecked();
      expect(await nameField()).toHaveValue('Trip');
      expect(
        screen.getByRole('combobox', { name: en['settings.budgetCurrency'] }),
      ).toHaveTextContent('EUR');
    });

    it('drops what other screens read for the previous budget', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();
      client.setQueryData(['read-by-another-screen'], 'the first budget');

      await choose(user, 'Trip');

      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      expect(client.getQueryData(['read-by-another-screen'])).toBeUndefined();
    });

    it('takes a failed save of the previous budget’s name off the screen', async () => {
      const user = userEvent.setup();
      renames.mockRejectedValue(refused(500));
      draw();

      await retype(user, 'Family');
      await user.click(save());
      await screen.findByRole('alert');

      await choose(user, 'Trip');

      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('drops the previous budget’s reads even when the screen is left before the answer', async () => {
      const user = userEvent.setup();
      let answer = () => {};
      activates.mockImplementation(
        (id) =>
          new Promise((resolve) => {
            answer = () => {
              budgets = budgets.map((each) => ({ ...each, active: each.id === id }));
              resolve(budget({ id, active: true }));
            };
          }),
      );
      const { unmount } = draw();
      await nameField();
      client.setQueryData(['read-by-another-screen'], 'the first budget');

      await choose(user, 'Trip');
      await waitFor(() => expect(activates).toHaveBeenCalledTimes(1));
      unmount();
      answer();

      await waitFor(() => expect(client.getQueryData(['read-by-another-screen'])).toBeUndefined());
    });

    it('forgets a name that was being typed for the previous budget', async () => {
      const user = userEvent.setup();
      draw();

      await retype(user, 'Half typed');
      await choose(user, 'Trip');

      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      expect(await nameField()).toHaveValue('Trip');
    });

    it('takes a press anywhere on a budget’s row as choosing it', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      const [, trip] = within(list()).getAllByRole('listitem');
      await user.click(within(trip as HTMLElement).getByTestId('budget-row-name'));

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', {
          name: interpolate(en['settings.budgetSwitchTitle'], { name: 'Trip' }),
        }),
      ).toBeInTheDocument();
      expect(activates).not.toHaveBeenCalled();
    });

    it('asks nothing when the row of the active budget is pressed', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      const [household] = within(list()).getAllByRole('listitem');
      await user.click(within(household as HTMLElement).getByTestId('budget-row-name'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(activates).not.toHaveBeenCalled();
    });

    it('lights up a row that can be chosen under the pointer, and leaves the active one still', async () => {
      draw();
      await nameField();

      const [household, trip] = within(list()).getAllByTestId('budget-row');

      expect(trip).toHaveClass('cursor-pointer', 'hover:border-ring', 'hover:bg-muted/50');
      expect(household).not.toHaveClass('cursor-pointer');
      expect(household).not.toHaveClass('hover:border-ring');
      expect(household).not.toHaveClass('hover:bg-muted/50');
    });

    it('asks before switching, and sends nothing until the answer', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await user.click(switchTo('Trip'));

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', {
          name: interpolate(en['settings.budgetSwitchTitle'], { name: 'Trip' }),
        }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(en['settings.budgetSwitchBody'])).toBeInTheDocument();
      expect(activates).not.toHaveBeenCalled();
      expect(
        screen.getByRole('radio', {
          name: interpolate(en['settings.budgetActiveNamed'], { name: 'Household' }),
          hidden: true,
        }),
      ).toBeChecked();
    });

    it('switches nothing when the question is declined', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await user.click(switchTo('Trip'));
      await user.click(await cancelButton());

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(activates).not.toHaveBeenCalled();
      expect(activeMark('Household')).toBeChecked();
      expect(switchTo('Trip')).not.toBeChecked();
    });

    it('closes the question once the switch went through', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await choose(user, 'Trip');

      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('takes no second answer and cannot be declined while the switch is in flight', async () => {
      const user = userEvent.setup();
      activates.mockReturnValue(new Promise(() => {}));
      draw();
      await nameField();

      await choose(user, 'Trip');
      await waitFor(() => expect(activates).toHaveBeenCalledTimes(1));

      expect(await confirmButton()).toBeDisabled();
      expect(await cancelButton()).toBeDisabled();

      await user.click(await confirmButton());
      expect(activates).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says the switch failed inside the question, and leaves the mark where it was', async () => {
      const user = userEvent.setup();
      activates.mockRejectedValue(refused(500));
      draw();
      await nameField();

      await choose(user, 'Trip');

      const alert = await within(await screen.findByRole('dialog')).findByRole('alert');
      expect(alert).toHaveTextContent(en['settings.budgetFailedTitle']);
      expect(alert).toHaveTextContent(en['settings.budgetFailed']);
      expect(await confirmButton()).toBeEnabled();

      await user.click(await cancelButton());

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(activeMark('Household')).toBeChecked();
      expect(switchTo('Trip')).not.toBeChecked();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('retries a lost switch under the key the question was opened with', async () => {
      const user = userEvent.setup();
      activates.mockRejectedValue(new Error('network'));
      draw();
      await nameField();

      await choose(user, 'Trip');
      await screen.findByRole('alert');
      await user.click(await confirmButton());

      await waitFor(() => expect(activates).toHaveBeenCalledTimes(2));
      expect(keyOfSwitch(1)).toBe(keyOfSwitch(0));
    });

    it('mints a new key each time the question is opened', async () => {
      const user = userEvent.setup();
      budgets = [...budgets, budget({ id: 'budget-3', name: 'Business', active: false })];
      activates.mockRejectedValue(new Error('network'));
      draw();
      await nameField();

      await choose(user, 'Trip');
      await screen.findByRole('alert');
      await user.click(await cancelButton());
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await choose(user, 'Business');

      await waitFor(() => expect(activates).toHaveBeenCalledTimes(2));
      expect(activates.mock.calls[1]?.[0]).toBe('budget-3');
      expect(keyOfSwitch(1)).not.toBe(keyOfSwitch(0));
    });

    it('mints a new key once the server refused the first one', async () => {
      const user = userEvent.setup();
      activates.mockRejectedValue(refused(409));
      draw();
      await nameField();

      await choose(user, 'Trip');
      await screen.findByRole('alert');
      await user.click(await confirmButton());

      await waitFor(() => expect(activates).toHaveBeenCalledTimes(2));
      expect(keyOfSwitch(1)).not.toBe(keyOfSwitch(0));
    });

    it('sends the switch back under a key of its own', async () => {
      const user = userEvent.setup();
      draw();
      await nameField();

      await choose(user, 'Trip');
      await waitFor(() => expect(activeMark('Trip')).toBeChecked());
      await choose(user, 'Household');
      await waitFor(() => expect(activeMark('Household')).toBeChecked());
      await choose(user, 'Trip');

      await waitFor(() => expect(activates).toHaveBeenCalledTimes(3));
      expect(keyOfSwitch(2)).not.toBe(keyOfSwitch(0));
    });

    it('has nothing to switch to with a single budget, and still offers a new one', async () => {
      budgets = [budget({ id: 'budget-1', name: 'Household', active: true })];
      draw();
      await nameField();

      expect(within(list()).getAllByRole('radio')).toHaveLength(1);
      expect(activeMark('Household')).toBeChecked();
      expect(screen.getByRole('link', { name: en['settings.budgetNew'] })).toHaveAttribute(
        'href',
        '/new',
      );
    });
  });
});
