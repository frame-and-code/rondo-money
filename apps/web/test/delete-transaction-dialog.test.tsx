import type { TransactionDto } from '@rondo/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeleteTransactionDialog } from '@/components/delete-transaction-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const money = moneyOf('en-US', 'PLN', 2);

const record = (over: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'r1',
  accountId: 'a1',
  categoryId: 'c1',
  date: '2026-08-31',
  amount: '-12050',
  type: 'EXPENSE',
  payee: 'Corner cafe',
  isSystem: false,
  transferId: null,
  counterAccountId: null,
  createdAt: '2026-08-31T09:20:00.000Z',
  ...over,
});

const show = (over: Partial<TransactionDto> = {}, onDelete = jest.fn()) => {
  render(
    <LocaleProvider initialLocale="en">
      <DeleteTransactionDialog
        record={record(over)}
        money={money}
        accountName={() => 'Wallet'}
        categoryName={() => 'Coffee'}
        failed={null}
        busy={false}
        onDelete={onDelete}
        onCancel={jest.fn()}
      />
    </LocaleProvider>,
  );

  return onDelete;
};

describe('confirming that a record goes', () => {
  it('lets a refused delete be asked again, because the first answer was not the record going', async () => {
    const pressed = jest.fn();
    const { rerender } = render(
      <LocaleProvider initialLocale="en">
        <DeleteTransactionDialog
          record={record()}
          money={money}
          accountName={() => 'Wallet'}
          categoryName={() => 'Coffee'}
          failed={null}
          busy={false}
          onDelete={pressed}
          onCancel={jest.fn()}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: en['transactions.delete'] }));

    const answered = (busy: boolean): void =>
      rerender(
        <LocaleProvider initialLocale="en">
          <DeleteTransactionDialog
            record={record()}
            money={money}
            accountName={() => 'Wallet'}
            categoryName={() => 'Coffee'}
            failed="transactions.failNetwork"
            busy={busy}
            onDelete={pressed}
            onCancel={jest.fn()}
          />
        </LocaleProvider>,
      );

    answered(true);
    answered(false);

    await userEvent.click(screen.getByRole('button', { name: en['transactions.delete'] }));

    expect(pressed).toHaveBeenCalledTimes(2);
  });

  it('names the record and the amount in the question itself', () => {
    show();

    expect(screen.getByText(/Corner cafe/)).toBeInTheDocument();
  });

  it('says what the account balance becomes', () => {
    show();

    expect(screen.getByTestId('delete-account-line')).toHaveTextContent('Wallet');
    expect(screen.getByTestId('delete-account-line')).toHaveTextContent('120.50');
  });

  it('says what the envelope gets back when the record had one', () => {
    show();

    expect(screen.getByTestId('delete-category-line')).toHaveTextContent('Coffee');
  });

  it('says the money goes back to ready to assign when the record had no envelope', () => {
    show({ id: 'r2', categoryId: null, type: 'INCOME', amount: '50000' });

    expect(screen.getByTestId('delete-pool-line')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-category-line')).not.toBeInTheDocument();
  });

  it('names both accounts of a transfer and mentions no envelope at all', () => {
    render(
      <LocaleProvider initialLocale="en">
        <DeleteTransactionDialog
          record={record({
            id: 'r7',
            type: 'TRANSFER',
            transferId: 't1',
            counterAccountId: 'a2',
            categoryId: null,
            payee: null,
            amount: '-50000',
          })}
          money={money}
          accountName={(id) => (id === 'a1' ? 'Wallet' : 'Card')}
          categoryName={() => 'Coffee'}
          failed={null}
          busy={false}
          onDelete={jest.fn()}
          onCancel={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('delete-account-line')).toHaveTextContent('Wallet');
    expect(screen.getByTestId('delete-counter-line')).toHaveTextContent('Card');
    expect(screen.queryByTestId('delete-category-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-pool-line')).not.toBeInTheDocument();
  });

  it('reads the leg it was opened from, so the money never goes back to where it arrives', () => {
    render(
      <LocaleProvider initialLocale="en">
        <DeleteTransactionDialog
          record={record({
            id: 'r8',
            type: 'TRANSFER',
            transferId: 't1',
            counterAccountId: 'a2',
            categoryId: null,
            payee: null,
            accountId: 'a1',
            amount: '50000',
          })}
          money={money}
          accountName={(id) => (id === 'a1' ? 'Wallet' : 'Card')}
          categoryName={() => 'Coffee'}
          failed={null}
          busy={false}
          onDelete={jest.fn()}
          onCancel={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('delete-account-line')).toHaveTextContent('Card');
    expect(screen.getByTestId('delete-counter-line')).toHaveTextContent('Wallet');
  });

  it('asks once and freezes while the request is in flight', async () => {
    const onDelete = jest.fn();
    show({}, onDelete);

    const remove = screen.getByRole('button', { name: en['transactions.delete'] });
    await userEvent.click(remove);
    await userEvent.click(remove);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
  it('names an account the screen no longer carries rather than leaving the sentence open', () => {
    render(
      <LocaleProvider initialLocale="en">
        <DeleteTransactionDialog
          record={record({
            id: 'r8',
            type: 'TRANSFER',
            transferId: 't2',
            counterAccountId: 'a9',
            categoryId: null,
            payee: null,
            amount: '-50000',
          })}
          money={money}
          accountName={(id) => (id === 'a1' ? 'Wallet' : null)}
          categoryName={() => 'Coffee'}
          failed={null}
          busy={false}
          onDelete={jest.fn()}
          onCancel={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('delete-counter-line')).toHaveTextContent(
      en['transactions.deleteArchivedCounterLine'].replace('{{amount}}', '500 zł'),
    );
  });
});
