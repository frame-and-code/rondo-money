import type { BudgetViewTargetDto, TargetKind } from '@rondo/types';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TargetDialog } from '@/components/target-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const onSave = jest.fn();
const onCancel = jest.fn();

const goal = (
  kind: TargetKind,
  parts: { amount: number; progress: number; monthTarget?: number; needed?: number },
): BudgetViewTargetDto => ({
  kind,
  amount: String(parts.amount),
  startMonth: '2026-07',
  progress: String(parts.progress),
  remaining: String(Math.max(0, parts.amount - parts.progress)),
  ...(kind === 'BY_DATE' ? { dueMonth: '2026-10' as const } : {}),
  ...(parts.monthTarget === undefined ? {} : { monthTarget: String(parts.monthTarget) }),
  ...(parts.needed === undefined ? {} : { needed: String(parts.needed) }),
});

const draw = (
  options: {
    target?: BudgetViewTargetDto | null;
    failed?: MessageKey | null;
    busy?: boolean;
    digits?: number;
    currency?: string;
  } = {},
) =>
  render(
    <LocaleProvider>
      <TargetDialog
        category={{ id: 'c1', name: 'Vacation' }}
        target={options.target ?? null}
        month="2026-08"
        money={moneyOf('ru-RU', options.currency ?? 'PLN', options.digits ?? 2)}
        failed={options.failed ?? null}
        busy={options.busy ?? false}
        onSave={onSave}
        onCancel={onCancel}
      />
    </LocaleProvider>,
  );

const pick = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole('radio', { name: new RegExp(label) }));

const amountField = () => screen.getByLabelText(en['categories.goalAmount']);

const save = () => screen.getByRole('button', { name: en['categories.save'] });

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('the form a goal is set in', () => {
  it('offers doing without a goal as the first of five answers, not as a button of its own', () => {
    draw();

    const answers = screen.getAllByRole('radio');

    expect(answers).toHaveLength(5);
    expect(answers[0]).toHaveAccessibleName(new RegExp(en['categories.goalNone']));
    expect(
      screen.queryByRole('button', { name: new RegExp(en['categories.goalNone']) }),
    ).not.toBeInTheDocument();
  });

  it('opens on the goal the category already carries', () => {
    draw({
      target: goal('BY_DATE', {
        amount: 100000,
        progress: 40000,
        monthTarget: 26666,
        needed: 6666,
      }),
    });

    expect(
      screen.getByRole('radio', { name: new RegExp(en['categories.goalByDate']) }),
    ).toBeChecked();
  });

  it('asks for a month only from the kind that has a deadline', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalByDate']);
    expect(screen.getByRole('button', { name: en['categories.goalDueMonth'] })).toBeInTheDocument();

    await pick(user, en['categories.goalContribute']);
    expect(
      screen.queryByRole('button', { name: en['categories.goalDueMonth'] }),
    ).not.toBeInTheDocument();
  });

  it('sends each kind with the amount that was typed, in minor units', async () => {
    const user = userEvent.setup();

    for (const [label, kind] of [
      [en['categories.goalRefillTo'], 'REFILL_TO'],
      [en['categories.goalContribute'], 'CONTRIBUTE'],
      [en['categories.goalAccumulate'], 'ACCUMULATE'],
    ] as const) {
      draw();
      await pick(user, label);
      await user.type(amountField(), '300');
      await user.click(save());

      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind, amount: '30000', dueMonth: null }),
      );
      cleanup();
    }
  });

  it('opens the months in a popover on the month the screen shows, and reaches a lifetime ahead', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalByDate']);
    await user.click(screen.getByRole('button', { name: en['categories.goalDueMonth'] }));

    expect(await screen.findByRole('grid')).toHaveAccessibleName('August 2026');
    expect(screen.getByRole('button', { name: en['common.calendarPrevious'] })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    const years = screen.getByRole('combobox', { name: en['common.calendarYear'] });

    const offered = within(years).getAllByRole('option');

    expect(offered).toHaveLength(61);
    expect(offered[0]).toHaveTextContent('2026');
    expect(offered[offered.length - 1]).toHaveTextContent('2086');
  });

  it('takes the month straight from the dropdowns, without asking for a day as well', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalByDate']);
    await user.type(amountField(), '1000');
    await user.click(screen.getByRole('button', { name: en['categories.goalDueMonth'] }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: en['common.calendarMonth'] }),
      'October',
    );

    expect(screen.getByRole('button', { name: /October 1st, 2026/ })).toHaveAttribute(
      'data-selected-single',
      'true',
    );

    await user.click(save());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BY_DATE', amount: '100000', dueMonth: '2026-10' }),
    );
  });

  it('sends a raised amount for a goal that is only being edited', async () => {
    const user = userEvent.setup();
    draw({
      target: goal('CONTRIBUTE', { amount: 40000, progress: 40000, monthTarget: 40000, needed: 0 }),
    });

    await user.clear(amountField());
    await user.type(amountField(), '600');
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'CONTRIBUTE', amount: '60000' }),
    );
  });

  it('closes the goal with an answer that carries no kind and no amount', async () => {
    const user = userEvent.setup();
    draw({
      target: goal('CONTRIBUTE', { amount: 40000, progress: 40000, monthTarget: 40000, needed: 0 }),
    });

    await pick(user, en['categories.goalNone']);
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ kind: null, amount: '', dueMonth: null }),
    );
    expect(screen.getByText(en['categories.goalClosing'])).toBeInTheDocument();
  });

  it('refuses to save a goal of nothing, which the server would refuse anyway', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '0');

    expect(save()).toBeDisabled();

    await user.click(save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses an amount that is still being typed, the way the move field does', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '300+');

    expect(save()).toBeDisabled();

    await user.type(amountField(), '50');
    expect(save()).toBeEnabled();

    await user.click(save());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: '35000' }));
  });

  it('refuses to save a deadline goal that has no deadline yet', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalByDate']);
    await user.type(amountField(), '1000');

    expect(save()).toBeDisabled();
  });

  it('saves on Enter from the amount, because that is where the typing ends', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '300{Enter}');

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'CONTRIBUTE', amount: '30000' }),
    );
  });

  it('does not save on Enter while the amount is one the server would refuse', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '0{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('mints one key when it opens, so a double press writes once', async () => {
    const user = userEvent.setup();
    draw();

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '300');
    await user.click(save());
    await user.click(save());

    expect(onSave).toHaveBeenCalledTimes(2);
    const [[first], [second]] = onSave.mock.calls;

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it('stops taking presses while the save it already sent is in flight', () => {
    draw({
      busy: true,
      target: goal('CONTRIBUTE', { amount: 40000, progress: 0, monthTarget: 40000, needed: 40000 }),
    });

    expect(save()).toBeDisabled();
  });

  it('says which refusal came back rather than that something went wrong', () => {
    draw({ failed: 'categories.failDueMonthPast' });

    expect(screen.getByText(en['categories.failDueMonthPast'])).toBeInTheDocument();
    expect(screen.queryByText(en['categories.failOther'])).not.toBeInTheDocument();
  });

  it('says a key was already used with another request', () => {
    draw({ failed: 'categories.failConflict' });

    expect(screen.getByText(en['categories.failConflict'])).toBeInTheDocument();
  });

  it('shows no amount for this month, not even one the screen is already holding', () => {
    draw({
      target: goal('BY_DATE', {
        amount: 100000,
        progress: 40000,
        monthTarget: 26666,
        needed: 6666,
      }),
    });

    const form = screen.getByTestId('target-dialog');

    expect(form).not.toHaveTextContent('266,66');
    expect(form).not.toHaveTextContent('66,66');
  });

  it('reads the amount at the digit count the budget keeps', async () => {
    const user = userEvent.setup();
    draw({ currency: 'JPY', digits: 0 });

    await pick(user, en['categories.goalContribute']);
    await user.type(amountField(), '5000');
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: '5000' }));
  });
});
