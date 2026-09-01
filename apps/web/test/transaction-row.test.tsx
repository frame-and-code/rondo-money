import type { TransactionDto } from '@rondo/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TransactionRow } from '@/components/transaction-row';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const money = moneyOf('en-US', 'PLN', 2);

const ZONE = 'Europe/Warsaw';

const NAMES: Record<string, string> = { a1: 'Wallet', a2: 'Card', c1: 'Coffee' };

const record = (over: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'r1',
  accountId: 'a1',
  categoryId: 'c1',
  date: '2026-08-31',
  amount: '-120050',
  type: 'EXPENSE',
  payee: 'Corner cafe',
  isSystem: false,
  transferId: null,
  counterAccountId: null,
  createdAt: '2026-08-31T09:20:00.000Z',
  ...over,
});

const show = (over: Partial<TransactionDto> = {}, showAccount = false) =>
  render(
    <LocaleProvider initialLocale="en">
      <TransactionRow
        record={record(over)}
        money={money}
        timeZone={ZONE}
        accountName={(id) => NAMES[id] ?? null}
        categoryOf={(id) =>
          NAMES[id] === undefined ? null : { name: NAMES[id], icon: null, color: null }
        }
        showAccount={showAccount}
        showAdded
        onOpen={jest.fn()}
        onDelete={jest.fn()}
      />
    </LocaleProvider>,
  );

describe('one row of the feed', () => {
  it('leaves an expense in the ordinary colour and paints income green', () => {
    show();
    expect(screen.getByTestId('amount-r1').className).not.toContain('text-success');

    show({ id: 'r2', amount: '50000', type: 'INCOME', categoryId: null });
    expect(screen.getByTestId('amount-r2').className).toContain('text-success');
  });

  it('never paints an amount red, because an expense is not a warning', () => {
    show();

    expect(screen.getByTestId('amount-r1').className).not.toContain('text-destructive');
  });

  it('names a record with no payee rather than leaving the line empty', () => {
    show({ payee: null });

    expect(screen.getByText(en['transactions.noPayee'])).toBeInTheDocument();
  });

  it('reads a transfer leg as the account at its other end', () => {
    show({
      id: 'r3',
      type: 'TRANSFER',
      transferId: 't1',
      counterAccountId: 'a2',
      categoryId: null,
      payee: null,
    });

    expect(screen.getByText('Transfer to Card')).toBeInTheDocument();
    expect(screen.getByText(en['transactions.transferBadge'])).toBeInTheDocument();
  });

  it('names the opening balance and marks it as the app’s own', () => {
    show({
      id: 'r4',
      isSystem: true,
      amount: '100000',
      type: 'INCOME',
      categoryId: null,
      payee: null,
    });

    expect(screen.getByText(en['transactions.openingBalance'])).toBeInTheDocument();
    expect(screen.getByText(en['transactions.systemBadge'])).toBeInTheDocument();
  });

  it('offers no menu on a record a person may not change', async () => {
    show({ id: 'r5', isSystem: true, payee: null });

    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('opens the record wherever the row is pressed, not only on its name', async () => {
    const onOpen = jest.fn();

    render(
      <LocaleProvider initialLocale="en">
        <TransactionRow
          record={record()}
          money={money}
          timeZone={ZONE}
          accountName={(id) => NAMES[id] ?? null}
          categoryOf={(id) =>
            NAMES[id] === undefined ? null : { name: NAMES[id], icon: null, color: null }
          }
          showAccount={false}
          showAdded
          onOpen={onOpen}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Corner cafe' }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('names the account only when the feed covers every account', () => {
    show({}, false);
    expect(screen.queryByText(/Wallet/)).not.toBeInTheDocument();

    show({ id: 'r6' }, true);
    expect(screen.getByText(/Wallet/)).toBeInTheDocument();
  });

  it('opens a transfer leg and offers to remove it, because a pair has its own operation now', async () => {
    const onOpen = jest.fn();
    const onDelete = jest.fn();
    const written = record({
      id: 'r7',
      type: 'TRANSFER',
      transferId: 't1',
      counterAccountId: 'a2',
      categoryId: null,
      payee: null,
      amount: '-50000',
    });

    render(
      <LocaleProvider initialLocale="en">
        <TransactionRow
          record={written}
          money={money}
          timeZone={ZONE}
          accountName={(id) => NAMES[id] ?? null}
          categoryOf={(id) =>
            NAMES[id] === undefined ? null : { name: NAMES[id], icon: null, color: null }
          }
          showAccount={false}
          showAdded
          onOpen={onOpen}
          onDelete={onDelete}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Transfer to Card' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'r7' }));

    await userEvent.click(
      screen.getByRole('button', {
        name: en['transactions.deleteOne'].replace('{{payee}}', 'Transfer to Card'),
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: en['transactions.delete'] }));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'r7' }));
  });

  it('shows the time a record was entered in the budget timezone', () => {
    show();

    expect(screen.getByTestId('added-r1')).toHaveTextContent('11:20');
  });

  it('names a transfer without its other side when that account is gone from the screen', () => {
    show({
      type: 'TRANSFER',
      transferId: 't1',
      counterAccountId: 'a9',
      categoryId: null,
      payee: null,
    });

    expect(screen.getByText(en['transactions.transferPlain'])).toBeInTheDocument();
    expect(screen.queryByText(/Transfer to\s*$/)).not.toBeInTheDocument();
  });
});
