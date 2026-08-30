import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryActions } from '@/components/category-actions';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const onEdit = jest.fn();
const onHide = jest.fn();
const onGoal = jest.fn();

const draw = (options: { hidden?: boolean; currentMonth?: boolean } = {}) =>
  render(
    <LocaleProvider>
      <CategoryActions
        category={{ id: 'c1', name: 'Кафе и рестораны', hidden: options.hidden ?? false }}
        currentMonth={options.currentMonth ?? true}
        onEdit={onEdit}
        onHide={onHide}
        onGoal={onGoal}
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

    expect(screen.getAllByRole('button')).toHaveLength(4);
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
        .slice(1)
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
