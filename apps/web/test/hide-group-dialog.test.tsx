import { cleanup, render, screen } from '@testing-library/react';

import { HideGroupDialog } from '@/components/hide-group-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const onMoveOut = jest.fn();
const onHide = jest.fn();
const onCancel = jest.fn();

const draw = (categories: { id: string; name: string; availableAllTime: bigint }[]) =>
  render(
    <LocaleProvider>
      <HideGroupDialog
        group={{ id: 'g1', name: 'Стройка', categories }}
        failed={null}
        money={moneyOf('ru', 'PLN', 2, { signed: true })}
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

describe('the dialog that hides a group', () => {
  it('holds the hide back while any category of the group still holds money', () => {
    draw([
      { id: 'c1', name: 'Материалы', availableAllTime: 0n },
      { id: 'c2', name: 'Мебель', availableAllTime: 12_000n },
    ]);

    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
    expect(screen.getByText(en['categories.hideGroupBlocked'])).toBeInTheDocument();
  });

  it('holds it back on an overspend too, because a hidden debt is the same lost envelope', () => {
    draw([{ id: 'c1', name: 'Материалы', availableAllTime: -500n }]);

    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeDisabled();
  });

  it('names how the group will leave rather than only refusing, so the step is obvious', () => {
    draw([{ id: 'c1', name: 'Материалы', availableAllTime: 0n }]);

    expect(screen.getByText(en['categories.hideGroupBody'])).toBeInTheDocument();
  });

  it('offers the move on the row that blocks, and on no other', () => {
    draw([
      { id: 'c1', name: 'Материалы', availableAllTime: 0n },
      { id: 'c2', name: 'Мебель', availableAllTime: 12_000n },
    ]);

    const moves = screen.getAllByRole('button', { name: en['categories.release'] });

    expect(moves).toHaveLength(1);
    expect(screen.getByTestId('group-hide-c2').closest('li')).toContainElement(moves[0] ?? null);
  });

  it('keeps the blocking amount plain, since red is what an amount below zero says', () => {
    draw([
      { id: 'c1', name: 'Мебель', availableAllTime: 12_000n },
      { id: 'c2', name: 'Материалы', availableAllTime: -500n },
    ]);

    expect(screen.getByTestId('group-hide-c1')).not.toHaveClass('text-destructive');
    expect(screen.getByTestId('group-hide-c2')).toHaveClass('text-destructive');
  });

  it('ticks the categories that are ready and crosses the ones that are not', () => {
    draw([
      { id: 'c1', name: 'Материалы', availableAllTime: 0n },
      { id: 'c2', name: 'Мебель', availableAllTime: 12_000n },
    ]);

    expect(screen.getByTestId('group-status-c1')).toHaveAttribute('data-state', 'ok');
    expect(screen.getByTestId('group-status-c2')).toHaveAttribute('data-state', 'blocked');
  });

  it('says why a press was refused instead of leaving the dialog silent', () => {
    render(
      <LocaleProvider>
        <HideGroupDialog
          group={{ id: 'g1', name: 'Стройка', categories: [] }}
          failed="categories.failAlreadyHidden"
          money={moneyOf('ru', 'PLN', 2, { signed: true })}
          onMoveOut={onMoveOut}
          onHide={onHide}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(en['categories.failAlreadyHidden']);
  });

  it('lets the group go once every category reads zero', () => {
    draw([
      { id: 'c1', name: 'Материалы', availableAllTime: 0n },
      { id: 'c2', name: 'Мебель', availableAllTime: 0n },
    ]);

    expect(screen.getByRole('button', { name: en['categories.hide'] })).toBeEnabled();
    expect(screen.queryByText(en['categories.hideGroupBlocked'])).not.toBeInTheDocument();
  });
});
