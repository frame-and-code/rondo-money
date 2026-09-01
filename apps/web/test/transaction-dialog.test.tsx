import type { TransactionDto } from '@rondo/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  TransactionDialog,
  type TransactionDraft,
  type TransferDraft,
} from '@/components/transaction-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const money = moneyOf('en-US', 'PLN', 2);

const TODAY = '2026-08-31';

const accounts = [
  { id: 'a1', name: 'Wallet', balance: '125050' },
  { id: 'a2', name: 'Card', balance: '-4000' },
];

const groups = [
  {
    id: 'g1',
    name: 'Everyday',
    categories: [{ id: 'c1', name: 'Coffee', icon: null, color: null }],
  },
  { id: 'g2', name: 'Joy', categories: [{ id: 'c2', name: 'Cinema', icon: null, color: null }] },
];

const show = (
  over: {
    record?: TransactionDto | null;
    defaults?: { accountId: string; date: string; categoryId: string | null; payee: string | null };
    onSave?: (draft: TransactionDraft, andMore: boolean) => void;
    onTransfer?: (draft: TransferDraft, andMore: boolean) => void;
    onDelete?: () => void;
    written?: number;
  } = {},
) => {
  const onSave = over.onSave ?? jest.fn();
  const onTransfer = over.onTransfer ?? jest.fn();
  let written = over.written ?? 0;

  const view = (round: number) => (
    <LocaleProvider initialLocale="en">
      <TransactionDialog
        record={over.record ?? null}
        accounts={accounts}
        groups={groups}
        kept={null}
        payees={['Corner cafe', 'Pharmacy']}
        money={money}
        today={TODAY}
        defaults={over.defaults ?? { accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
        failed={null}
        busy={false}
        written={round}
        onSave={onSave}
        onTransfer={onTransfer}
        onDelete={over.onDelete ?? jest.fn()}
      />
    </LocaleProvider>
  );

  const { rerender } = render(view(written));

  const land = (): void => {
    written += 1;
    rerender(view(written));
  };

  return { onSave, onTransfer, land };
};

const typeAmount = async (value: string): Promise<void> => {
  await userEvent.type(screen.getByLabelText(en['transactions.amountLabel']), value);
};

const pickCategory = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('the form a record is written in', () => {
  it('is titled by the action that opened it', () => {
    show();

    expect(screen.getByText(en['transactions.createExpense'])).toBeInTheDocument();
  });

  it('opens on the day and the category of the last record written', () => {
    show({ defaults: { accountId: 'a1', date: '2026-08-25', categoryId: 'c1', payee: null } });

    expect(screen.getByText('25 August 2026')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }),
    ).toHaveTextContent('Coffee');
  });

  it('refuses to save an expense with no category', async () => {
    show();
    await typeAmount('120.50');

    expect(screen.getByRole('button', { name: en['transactions.save'] })).toBeDisabled();
  });

  it('saves income with no category, which is ready to assign', async () => {
    const { onSave } = show();

    await userEvent.click(screen.getByRole('button', { name: en['transactions.kindIncome'] }));
    await typeAmount('500');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INCOME', categoryId: null, amount: '50000' }),
      false,
    );
  });

  it('sends the amount without a sign, and the type says which way it goes', async () => {
    const { onSave } = show();

    await typeAmount('120.50');
    await pickCategory('Coffee');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXPENSE', amount: '12050', categoryId: 'c1' }),
      false,
    );
  });

  it('refuses an expression that comes out below zero', async () => {
    show();

    await typeAmount('110-1500');
    await pickCategory('Coffee');

    expect(screen.getByRole('button', { name: en['transactions.save'] })).toBeDisabled();
  });

  it('mints one key per opening, so a double press writes once', async () => {
    const onSave = jest.fn();
    show({ onSave });

    await typeAmount('100');
    await pickCategory('Coffee');

    const save = screen.getByRole('button', { name: en['transactions.save'] });
    await userEvent.click(save);
    await userEvent.click(save);

    const [first, second] = onSave.mock.calls;

    expect(first?.[0].idempotencyKey).toBe(second?.[0].idempotencyKey);
  });

  it('mints a new key after saving and adding another, or the second record is a repeat', async () => {
    const onSave = jest.fn();
    const { land } = show({ onSave });

    await typeAmount('100');
    await pickCategory('Coffee');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));
    land();

    await typeAmount('250');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));

    const [first, second] = onSave.mock.calls;

    expect(first?.[0].idempotencyKey).not.toBe(second?.[0].idempotencyKey);
    expect(second?.[0].amount).toBe('25000');
  });

  it('keeps the day, the account and the category after saving and adding another', async () => {
    const onSave = jest.fn();
    const { land } = show({
      onSave,
      defaults: { accountId: 'a2', date: '2026-08-20', categoryId: 'c1', payee: null },
    });

    await typeAmount('100');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));
    land();

    expect(screen.getByTestId('entry-flash')).toBeInTheDocument();

    await typeAmount('250');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));

    expect(onSave.mock.calls[1]?.[0]).toMatchObject({
      accountId: 'a2',
      date: '2026-08-20',
      categoryId: 'c1',
    });
  });

  it('keeps the payee after saving and adding another, the way the day and the envelope stay', async () => {
    const onSave = jest.fn();
    show({ onSave, defaults: { accountId: 'a1', date: TODAY, categoryId: 'c1', payee: null } });

    await typeAmount('100');
    await userEvent.type(screen.getByLabelText(en['transactions.payeeExpense']), 'Corner cafe');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));

    expect(onSave.mock.calls[0]?.[0].payee).toBe('Corner cafe');
    expect(
      screen.getByRole('combobox', { name: en['transactions.payeeExpense'] }),
    ).toHaveTextContent('Corner cafe');
  });

  it('keeps a record with no payee empty, because the last one typed is not this record', async () => {
    const saved = jest.fn();

    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={{
            id: 'r9',
            accountId: 'a1',
            categoryId: null,
            date: '2026-08-20',
            amount: '100000',
            type: 'INCOME',
            payee: null,
            isSystem: true,
            transferId: null,
            counterAccountId: null,
            createdAt: '2026-08-20T10:00:00.000Z',
          }}
          accounts={accounts}
          groups={groups}
          kept={null}
          payees={['Pharmacy']}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a2', date: TODAY, categoryId: 'c1', payee: 'Pharmacy' }}
          failed={null}
          busy={false}
          written={0}
          onSave={saved}
          onTransfer={jest.fn()}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ payee: null }), false);
  });

  it('gives a searched category to the keyboard, not the row above it', async () => {
    const saved = jest.fn();
    show({ onSave: saved });

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(en['transactions.kindIncome']) }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
    await userEvent.type(
      await screen.findByPlaceholderText(en['transactions.findCategory']),
      'Cof',
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(
      screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }),
    ).toHaveTextContent('Coffee');
  });

  it('says a search found nothing rather than showing an empty popup', async () => {
    show();

    await userEvent.click(screen.getByRole('combobox', { name: en['transactions.categoryLabel'] }));
    await userEvent.type(
      await screen.findByPlaceholderText(en['transactions.findCategory']),
      'zzz',
    );

    expect(await screen.findByText(en['transactions.nothingFound'])).toBeInTheDocument();
  });

  it('offers no second save when an old record is being changed', () => {
    show({
      record: {
        id: 'r1',
        accountId: 'a1',
        categoryId: 'c1',
        date: '2026-08-20',
        amount: '-12050',
        type: 'EXPENSE',
        payee: 'Corner cafe',
        isSystem: false,
        transferId: null,
        counterAccountId: null,
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    });

    expect(
      screen.getByRole('heading', { name: en['transactions.kindExpense'] }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: en['transactions.saveAndMore'] }),
    ).not.toBeInTheDocument();
  });

  it('offers to delete the record it is changing, which is how a phone reaches it', async () => {
    const onDelete = jest.fn();

    show({
      onDelete,
      record: {
        id: 'r1',
        accountId: 'a1',
        categoryId: 'c1',
        date: '2026-08-20',
        amount: '-12050',
        type: 'EXPENSE',
        payee: 'Corner cafe',
        isSystem: false,
        transferId: null,
        counterAccountId: null,
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: en['transactions.delete'] }));

    expect(onDelete).toHaveBeenCalled();
  });

  it('offers no delete while a record is being written for the first time', () => {
    show();

    expect(
      screen.queryByRole('button', { name: en['transactions.delete'] }),
    ).not.toBeInTheDocument();
  });

  it('offers only the amount on an opening balance, and no way to remove it', () => {
    show({
      record: {
        id: 'r9',
        accountId: 'a1',
        categoryId: null,
        date: '2026-06-01',
        amount: '100000',
        type: 'INCOME',
        payee: null,
        isSystem: true,
        transferId: null,
        counterAccountId: null,
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    });

    expect(screen.getByLabelText(en['transactions.amountLabel'])).toHaveValue('1000.00');
    expect(screen.queryByLabelText(en['transactions.payeeIncome'])).not.toBeVisible();
    expect(screen.queryByRole('button', { name: en['transactions.delete'] })).toBeNull();
  });

  it('paints the income choice with the token income already carries in the feed', async () => {
    show();

    const income = screen.getByRole('button', { name: new RegExp(en['transactions.kindIncome']) });
    await userEvent.click(income);

    expect(income.className).toContain('success');
    expect(
      screen.getByRole('button', { name: new RegExp(en['transactions.kindExpense']) }).className,
    ).not.toContain('success');
  });

  it('says what the chosen account holds, because the amount is written against it', () => {
    show();

    expect(
      screen.getByRole('combobox', { name: en['transactions.accountLabel'] }),
    ).toHaveTextContent('1,250.50');
  });

  it('opens with the payee of the last record, beside its day and its envelope', () => {
    show({
      defaults: { accountId: 'a1', date: '2026-08-25', categoryId: 'c1', payee: 'Pharmacy' },
    });

    expect(
      screen.getByRole('combobox', { name: en['transactions.payeeExpense'] }),
    ).toHaveTextContent('Pharmacy');
  });

  it('does not page the calendar past today, because a record is never dated later', async () => {
    show();

    await userEvent.click(screen.getByRole('button', { name: /2026/ }));

    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['common.calendarNext'] })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('closes the calendar on the day it was given, because one date is the whole answer', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: /2026/ }));
    await user.click(await screen.findByRole('button', { name: /August 20th, 2026/ }));

    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
    expect(screen.getByRole('button', { name: /20 August 2026/ })).toBeInTheDocument();
  });

  it('shows a refusal as an alert, in the words the design gave it', async () => {
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={null}
          accounts={accounts}
          groups={groups}
          kept={null}
          payees={[]}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
          failed="transactions.failFuture"
          busy={false}
          written={0}
          onSave={jest.fn()}
          onTransfer={jest.fn()}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent(en['transactions.failTitleExpense']);
    expect(alert).toHaveTextContent(en['transactions.failFuture']);
  });

  it('names the kind in a refusal about the account opening day', () => {
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={null}
          accounts={accounts}
          groups={groups}
          kept={null}
          payees={[]}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
          failed="transactions.failBeforeAccount"
          busy={false}
          written={0}
          onSave={jest.fn()}
          onTransfer={jest.fn()}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      en['transactions.failBeforeAccountExpense'],
    );
  });

  it('says nothing was recorded while the write is still out, and keeps what was typed', async () => {
    const onSave = jest.fn();
    show({ onSave });

    await typeAmount('100');
    await pickCategory('Coffee');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.saveAndMore'] }));

    expect(screen.queryByTestId('entry-flash')).toBeNull();
    expect(screen.getByLabelText(en['transactions.amountLabel'])).toHaveValue('100');
  });
});

const pickAccount = async (label: string, name: string): Promise<void> => {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(name) }));
};

const leg: TransactionDto = {
  id: 'r7',
  accountId: 'a1',
  categoryId: null,
  date: '2026-08-20',
  amount: '-50000',
  type: 'TRANSFER',
  payee: null,
  isSystem: false,
  transferId: 't1',
  counterAccountId: 'a2',
  createdAt: '2026-08-20T10:00:00.000Z',
};

const expense: TransactionDto = {
  id: 'r8',
  accountId: 'a1',
  categoryId: 'c1',
  date: '2026-08-20',
  amount: '-12050',
  type: 'EXPENSE',
  payee: 'Corner cafe',
  isSystem: false,
  transferId: null,
  counterAccountId: null,
  createdAt: '2026-08-20T10:00:00.000Z',
};

describe('the form a transfer is written in', () => {
  const chooseTransfer = async (): Promise<void> => {
    await userEvent.click(screen.getByRole('button', { name: en['transactions.kindTransfer'] }));
  };

  it('puts the second account where the envelope and the payee were', async () => {
    show();
    await chooseTransfer();

    expect(
      screen.queryByRole('combobox', { name: en['transactions.categoryLabel'] }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: en['transactions.payeeExpense'] }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: en['transactions.fromAccountLabel'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: en['transactions.toAccountLabel'] }),
    ).toBeInTheDocument();
  });

  it('saves the two accounts, the amount and the day, and nothing else', async () => {
    const { onTransfer, onSave } = show();

    await chooseTransfer();
    await typeAmount('500');
    await pickAccount(en['transactions.toAccountLabel'], 'Card');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onTransfer).toHaveBeenCalledWith(
      {
        fromAccountId: 'a1',
        toAccountId: 'a2',
        amount: '50000',
        date: TODAY,
        idempotencyKey: expect.any(String),
      },
      false,
    );
  });

  it('takes a tone of its own, so it is not read as another expense', async () => {
    show();

    const transfer = screen.getByRole('button', { name: en['transactions.kindTransfer'] });
    const expense = screen.getByRole('button', { name: en['transactions.kindExpense'] });

    expect(expense).toHaveClass('text-primary');
    expect(transfer).not.toHaveClass('text-warning');

    await chooseTransfer();

    expect(transfer).toHaveClass('text-warning');
    expect(expense).not.toHaveClass('text-primary');
  });

  it('fills the second account with the first one that is not the first side', async () => {
    const { onTransfer } = show();

    await chooseTransfer();

    expect(
      screen.getByRole('combobox', { name: en['transactions.toAccountLabel'] }),
    ).toHaveTextContent('Card');

    await typeAmount('500');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: 'a1', toAccountId: 'a2' }),
      false,
    );
  });

  it('moves the second account away when the first side takes it over', async () => {
    show();

    await chooseTransfer();
    await pickAccount(en['transactions.fromAccountLabel'], 'Card');

    expect(
      screen.getByRole('combobox', { name: en['transactions.toAccountLabel'] }),
    ).toHaveTextContent('Wallet');
    expect(screen.queryByText(en['transactions.sameAccountHint'])).not.toBeInTheDocument();
  });

  it('will not send one account named twice, and says why', async () => {
    show();

    await chooseTransfer();
    await typeAmount('500');
    await pickAccount(en['transactions.toAccountLabel'], 'Wallet');

    expect(screen.getByText(en['transactions.sameAccountHint'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['transactions.save'] })).toBeDisabled();
  });

  it('opens a leg with both sides filled from the leg and the account at its other end', () => {
    show({ record: leg });

    expect(
      screen.getByRole('heading', { name: en['transactions.editTransfer'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: en['transactions.fromAccountLabel'] }),
    ).toHaveTextContent('Wallet');
    expect(
      screen.getByRole('combobox', { name: en['transactions.toAccountLabel'] }),
    ).toHaveTextContent('Card');
  });

  it('mints a new key when an account is picked after a refusal, since that is a new intent', async () => {
    const onTransfer = jest.fn();
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={null}
          accounts={accounts}
          groups={groups}
          kept={null}
          payees={[]}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
          failed="transactions.failSameAccount"
          busy={false}
          written={0}
          onSave={jest.fn()}
          onTransfer={onTransfer}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: en['transactions.kindTransfer'] }));
    await typeAmount('500');
    await pickAccount(en['transactions.toAccountLabel'], 'Card');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    await pickAccount(en['transactions.fromAccountLabel'], 'Card');
    await pickAccount(en['transactions.toAccountLabel'], 'Wallet');
    await userEvent.click(screen.getByRole('button', { name: en['transactions.save'] }));

    const [first, second] = onTransfer.mock.calls;

    expect(second?.[0].idempotencyKey).not.toBe(first?.[0].idempotencyKey);
  });
});

describe('what a record already written may become', () => {
  it('does not offer to turn it into a transfer, which would write a second record beside it', () => {
    show({ record: expense });

    expect(
      screen.queryByRole('button', { name: en['transactions.kindTransfer'] }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: en['transactions.kindExpense'] }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['transactions.kindIncome'] })).toBeInTheDocument();
  });

  it('names the transfer in the refusal, rather than the income it is not', async () => {
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={null}
          accounts={accounts}
          groups={groups}
          kept={null}
          payees={[]}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
          failed="transactions.failSameAccount"
          busy={false}
          written={0}
          onSave={jest.fn()}
          onTransfer={jest.fn()}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText(en['transactions.failTitleExpense'])).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: en['transactions.kindTransfer'] }));

    expect(screen.getByText(en['transactions.failTitleTransfer'])).toBeInTheDocument();
  });
});

describe('what the form offers when the budget holds one account', () => {
  const withAccounts = (held: { id: string; name: string; balance: string }[]) =>
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDialog
          record={null}
          accounts={held}
          groups={groups}
          kept={null}
          payees={[]}
          money={money}
          today={TODAY}
          defaults={{ accountId: 'a1', date: TODAY, categoryId: null, payee: null }}
          failed={null}
          busy={false}
          written={0}
          onSave={jest.fn()}
          onTransfer={jest.fn()}
          onDelete={jest.fn()}
        />
      </LocaleProvider>,
    );

  it('leaves the transfer out, because there is no second account to send money to', () => {
    withAccounts([{ id: 'a1', name: 'Wallet', balance: '125050' }]);

    expect(
      screen.queryByRole('button', { name: en['transactions.kindTransfer'] }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: en['transactions.kindExpense'] }),
    ).toBeInTheDocument();
  });

  it('offers it as soon as a second account exists', () => {
    withAccounts(accounts);

    expect(
      screen.getByRole('button', { name: en['transactions.kindTransfer'] }),
    ).toBeInTheDocument();
  });
});
