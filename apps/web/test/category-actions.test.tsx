import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryActions } from '@/components/category-actions';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const onEdit = jest.fn();
const onHide = jest.fn();
const onGoal = jest.fn();
const onPaid = jest.fn();
const onAddTransaction = jest.fn();

const draw = (options: { hidden?: boolean; currentMonth?: boolean; paid?: boolean } = {}) =>
  render(
    <LocaleProvider>
      <CategoryActions
        category={{
          id: 'c1',
          name: 'Кафе и рестораны',
          hidden: options.hidden ?? false,
          paid: options.paid ?? false,
        }}
        currentMonth={options.currentMonth ?? true}
        onEdit={onEdit}
        onHide={onHide}
        onGoal={onGoal}
        onPaid={onPaid}
        onAddTransaction={onAddTransaction}
      />
    </LocaleProvider>,
  );

const unfold = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: en['categories.manage'] }));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('the actions under the move fields', () => {
  it('keeps the actions folded away until the row is opened', () => {
    draw();

    expect(screen.getByRole('button', { name: en['categories.manage'] })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: en['categories.edit'] })).not.toBeInTheDocument();
  });

  it('unfolds every action the category has, and no other', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    for (const label of [en['categories.edit'], en['categories.hide'], en['categories.goal']]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('offers one way into the dialog rather than three that open the same one', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  it('sends each row to its own dialog', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    await user.click(screen.getByRole('button', { name: en['categories.edit'] }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('offers nothing that deletes the category', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/delete|Delete|remove|Remove/);
    }
  });

  it('puts the goal first, because it is what a card is opened for most often', async () => {
    const user = userEvent.setup();
    draw();

    await unfold(user);

    expect(
      screen
        .getAllByRole('button')
        .slice(3)
        .map((row) => row.textContent),
    ).toEqual([en['categories.goal'], en['categories.edit'], en['categories.hide']]);
  });

  it('sends the goal row to the goal form and leaves the two beside it alone', async () => {
    const user = userEvent.setup();
    draw();

    await unfold(user);
    await user.click(screen.getByRole('button', { name: en['categories.goal'] }));

    expect(onGoal).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('shows the goal of a hidden category but refuses to open it for changing', async () => {
    const user = userEvent.setup();
    draw({ hidden: true });

    await unfold(user);
    const goal = screen.getByRole('button', { name: en['categories.goal'] });

    expect(goal).toBeDisabled();
    expect(screen.getByText(en['categories.goalHiddenCategory'])).toBeInTheDocument();

    await user.click(goal);
    expect(onGoal).not.toHaveBeenCalled();
  });

  it('refuses the goal form outside the current month, because the write lands in that one', async () => {
    const user = userEvent.setup();
    draw({ currentMonth: false });

    await unfold(user);
    const goal = screen.getByRole('button', { name: en['categories.goal'] });

    expect(goal).toBeDisabled();
    expect(screen.getByText(en['categories.goalOnlyThisMonth'])).toBeInTheDocument();

    await user.click(goal);
    expect(onGoal).not.toHaveBeenCalled();
  });

  it('says nothing extra while the goal row works', async () => {
    const user = userEvent.setup();
    draw();

    await unfold(user);

    expect(screen.queryByText(en['categories.goalOnlyThisMonth'])).not.toBeInTheDocument();
    expect(screen.queryByText(en['categories.goalHiddenCategory'])).not.toBeInTheDocument();
  });
});

describe('closing the category for the month', () => {
  it('sits above the folded actions and is reachable without unfolding them', () => {
    draw();

    const rows = screen.getAllByRole('button').map((row) => row.textContent);
    expect(rows.indexOf(en['categories.paidClose'])).toBeGreaterThanOrEqual(0);
    expect(rows.indexOf(en['categories.paidClose'])).toBeLessThan(
      rows.indexOf(en['categories.manage']),
    );
    expect(screen.queryByRole('button', { name: en['categories.edit'] })).not.toBeInTheDocument();
  });

  it('offers to reopen a category that is already closed', () => {
    draw({ paid: true });

    expect(screen.getByRole('button', { name: en['categories.paidReopen'] })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en['categories.paidClose'] }),
    ).not.toBeInTheDocument();
  });

  it('hands the click to the screen, which decides whether to ask first', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.paidClose'] }));

    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('offers to add a transaction right before the paid mark, outside the folded actions', () => {
    draw();

    const rows = screen.getAllByRole('button').map((row) => row.textContent);

    expect(rows.slice(0, 3)).toEqual([
      en['categories.addTransaction'],
      en['categories.paidClose'],
      en['categories.manage'],
    ]);
  });

  it('sends the add row to the transaction form and nothing else', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.addTransaction'] }));

    expect(onAddTransaction).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('refuses to add a transaction to a hidden category, which no new record may land in', async () => {
    const user = userEvent.setup();
    draw({ hidden: true });

    const add = screen.getByRole('button', { name: en['categories.addTransaction'] });

    expect(add).toBeDisabled();
    await user.click(add);
    expect(onAddTransaction).not.toHaveBeenCalled();
  });
});
