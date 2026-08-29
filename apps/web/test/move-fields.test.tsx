import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MoveFields } from '@/components/move-fields';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';
import { moneyOf } from '@/lib/money';
import { POOL, type MoveTarget } from '@/lib/move-target';

const pool: MoveTarget = {
  id: POOL,
  name: ru['categories.readyToAssign'],
  available: 85000n,
  icon: null,
  color: null,
};

const food: MoveTarget = {
  id: 'food',
  name: 'Продукты',
  available: 48000n,
  icon: 'shopping-cart',
  color: 'green',
};

const car: MoveTarget = {
  id: 'car',
  name: 'Транспорт',
  available: -1250n,
  icon: 'car',
  color: 'orange',
};

const onChoose = jest.fn();
const onPicking = jest.fn();
const onSwap = jest.fn();

const draw = (over: Partial<Parameters<typeof MoveFields>[0]> = {}) =>
  render(
    <LocaleProvider initialLocale="ru">
      <MoveFields
        category={food}
        other={pool}
        targets={[pool, car]}
        outgoing
        assigning={false}
        picking={false}
        draft=""
        query=""
        ready
        saving={false}
        frozen={false}
        money={moneyOf('ru', 'PLN', 2, { signed: true })}
        notice={null}
        large={false}
        onDraft={jest.fn()}
        onQuery={jest.fn()}
        onPicking={onPicking}
        onChoose={onChoose}
        onSwap={onSwap}
        onCommit={jest.fn()}
        onCancel={jest.fn()}
        {...over}
      />
    </LocaleProvider>,
  );

const trigger = (name: string) =>
  screen.getByRole('combobox', {
    name: ru['categories.moveOther'].replace('{{envelope}}', name),
  });

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
});

describe('the two envelopes a move names', () => {
  it('shows the category it was opened from first, and what each envelope holds', () => {
    draw();

    expect(screen.getByText('Продукты')).toBeInTheDocument();
    expect(screen.getByText(/850,00/)).toBeInTheDocument();
    expect(screen.getByText(/480,00/)).toBeInTheDocument();
  });

  it('reds an overspent envelope on the row it stands on, by the rule the tiles follow', () => {
    draw({ category: car });

    expect(screen.getByText(/-12,50/)).toHaveClass('text-destructive');
    expect(screen.getByText(/850,00/)).not.toHaveClass('text-destructive');
  });

  it('carries the amount on both rows, so either one can be typed into', () => {
    draw({ draft: '150,00' });

    const fields = screen.getAllByRole('textbox');

    expect(fields).toHaveLength(2);
    expect(fields[0]).toHaveAccessibleName(
      ru['categories.moveAmountFor'].replace('{{envelope}}', food.name),
    );
    expect(fields[1]).toHaveAccessibleName(
      ru['categories.moveAmountFor'].replace('{{envelope}}', pool.name),
    );
    expect(fields[0]).toHaveValue('150,00');
    expect(fields[1]).toHaveValue('150,00');
  });

  it('reports what was typed into the other row as the same amount', async () => {
    const user = userEvent.setup();
    const onDraft = jest.fn();
    draw({ onDraft });

    await user.type(
      screen.getByLabelText(
        ru['categories.moveAmountFor'].replace('{{envelope}}', ru['categories.readyToAssign']),
      ),
      '7',
    );

    expect(onDraft).toHaveBeenCalledWith('7');
  });

  it('hands the turn back rather than turning anything itself', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: ru['categories.moveSwapIn'] }));

    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('points the arrow the way the money goes, and says what pressing it would do', () => {
    draw({ outgoing: true });

    expect(screen.getByTestId('move-arrow')).not.toHaveClass('rotate-180');
    expect(screen.getByRole('button', { name: ru['categories.moveSwapIn'] })).toBeInTheDocument();

    cleanup();
    draw({ outgoing: false });

    expect(screen.getByTestId('move-arrow')).toHaveClass('rotate-180');
    expect(screen.getByRole('button', { name: ru['categories.moveSwapOut'] })).toBeInTheDocument();
  });

  it('calls the action assigning only when the money comes out of what is free', () => {
    draw({ assigning: true });

    expect(screen.getByRole('button', { name: ru['categories.moveAssign'] })).toBeInTheDocument();
  });
});

describe('the list of envelopes', () => {
  it('offers what it was given, in that order', () => {
    draw({ picking: true });

    const rows = screen.getAllByRole('option');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(ru['categories.readyToAssign']);
    expect(rows[1]).toHaveTextContent('Транспорт');
  });

  it('marks the envelope that is already chosen', () => {
    draw({ picking: true, other: car });

    expect(screen.getByRole('option', { name: /Транспорт/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('hands the chosen envelope back rather than deciding anything itself', async () => {
    const user = userEvent.setup();
    draw({ picking: true });

    await user.click(screen.getByRole('option', { name: /Транспорт/ }));

    expect(onChoose).toHaveBeenCalledWith(car);
  });

  it('shows what an envelope holds beside its name, in the red when it is overspent', () => {
    draw({ picking: true });

    const overspent = screen.getByRole('option', { name: /Транспорт/ });

    expect(within(overspent).getByText(/-12,50/)).toHaveClass('text-destructive');
  });
});

describe('an amount the surface cannot send', () => {
  it('offers no action, so pressing it is never a dead end', () => {
    draw({ ready: false });

    expect(screen.getByRole('button', { name: ru['categories.moveSubmit'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: ru['categories.moveCancel'] })).toBeEnabled();
  });
});

describe('while a request nobody answered still stands', () => {
  it('freezes the amount, the direction and the choice of envelope, but never the way out', () => {
    draw({ frozen: true });

    for (const field of screen.getAllByRole('textbox')) {
      expect(field).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: ru['categories.moveSwapIn'] })).toBeDisabled();
    expect(trigger(ru['categories.readyToAssign'])).toBeDisabled();
    expect(screen.getByRole('button', { name: ru['categories.moveSubmit'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: ru['categories.moveCancel'] })).toBeEnabled();
  });
});
