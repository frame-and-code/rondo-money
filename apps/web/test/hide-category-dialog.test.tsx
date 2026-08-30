import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HideCategoryDialog } from '@/components/hide-category-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const onMoveOut = jest.fn();
const onHide = jest.fn();
const onCancel = jest.fn();

const draw = (
  category: { available: bigint; availableAllTime: bigint },
  digits = 2,
  currency = 'PLN',
) =>
  render(
    <LocaleProvider>
      <HideCategoryDialog
        category={{ id: 'c1', name: 'Отпуск', ...category }}
        failed={null}
        money={moneyOf('ru', currency, digits, { signed: true })}
        onMoveOut={onMoveOut}
        onHide={onHide}
        onCancel={onCancel}
      />
    </LocaleProvider>,
  );

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('the dialog that hides a category', () => {
  it('splits the remainder into this month and the later ones, and gives their sum', () => {
    draw({ available: 0n, availableAllTime: 40_000n });

    const total = screen.getByTestId('hide-total');
    const later = screen.getByTestId('hide-future');
    const now = screen.getByTestId('hide-this-month');

    expect(now).toHaveTextContent('0 ');
    expect(later).toHaveTextContent('400 ');
    expect(total).toHaveTextContent('400 ');
  });

  it('offers to move the remainder out before it offers to hide anything', () => {
    draw({ available: 0n, availableAllTime: 40_000n });

    expect(screen.getByRole('button', { name: en['categories.release'] })).toBeEnabled();
    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
  });

  it('sweeps the whole remainder in one press, without a second surface to fill in', async () => {
    const user = userEvent.setup();
    draw({ available: 0n, availableAllTime: 40_000n });

    await user.click(screen.getByRole('button', { name: en['categories.release'] }));

    expect(onMoveOut).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();
  });

  it('says a hidden category takes no new transaction, so nothing is entered too late', () => {
    draw({ available: 0n, availableAllTime: 40_000n });

    expect(screen.getByText(en['categories.hideTransactionWarning'])).toBeInTheDocument();
  });

  it('freezes both buttons while a press is still in flight, so one click is one write', () => {
    render(
      <LocaleProvider>
        <HideCategoryDialog
          category={{ id: 'c1', name: 'Отпуск', available: 0n, availableAllTime: 40_000n }}
          failed={null}
          money={moneyOf('ru', 'PLN', 2, { signed: true })}
          busy
          onMoveOut={onMoveOut}
          onHide={onHide}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('button', { name: en['categories.release'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
  });

  it('says why a press was refused instead of leaving the dialog silent', () => {
    render(
      <LocaleProvider>
        <HideCategoryDialog
          category={{ id: 'c1', name: 'Отпуск', available: 0n, availableAllTime: 0n }}
          money={moneyOf('ru', 'PLN', 2, { signed: true })}
          failed="categories.failAlreadyHidden"
          onMoveOut={onMoveOut}
          onHide={onHide}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(en['categories.failAlreadyHidden']);
  });

  it('goes straight to hiding when the category holds nothing anywhere', async () => {
    const user = userEvent.setup();
    draw({ available: 0n, availableAllTime: 0n });

    expect(
      screen.queryByRole('button', { name: en['categories.release'] }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));

    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('blocks the hide on an overspend the same way it blocks it on a remainder', () => {
    draw({ available: -3_000n, availableAllTime: -3_000n });

    expect(screen.getByTestId('hide-total')).toHaveTextContent('-30 ');
    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
  });

  it('reds an amount below zero and leaves one above it plain, as every other money surface does', () => {
    draw({ available: -3_000n, availableAllTime: 37_000n });

    expect(screen.getByTestId('hide-this-month')).toHaveClass('text-destructive');
    expect(screen.getByTestId('hide-total')).not.toHaveClass('text-destructive');
  });

  it('takes the digit count from the currency, so a yen budget is not divided', () => {
    draw({ available: 0n, availableAllTime: 5_000n }, 0, 'JPY');

    expect(screen.getByTestId('hide-total')).toHaveTextContent('5 000');
  });
});
