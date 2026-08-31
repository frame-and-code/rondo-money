import type { AccountBalanceDto } from '@rondo/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AccountPanel } from '@/components/account-panel';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const money = moneyOf('en-US', 'PLN', 2);

const held: AccountBalanceDto[] = [
  { id: 'a1', name: 'Wallet', type: 'CASH', balance: '125050' },
  { id: 'a2', name: 'Card', type: 'DEBIT', balance: '-4000' },
];

const show = (
  over: {
    accounts?: AccountBalanceDto[];
    total?: string;
    selected?: string | null;
    onSelect?: (id: string | null) => void;
    onRename?: (account: AccountBalanceDto) => void;
    onAdd?: () => void;
  } = {},
) => {
  render(
    <LocaleProvider initialLocale="en">
      <AccountPanel
        accounts={over.accounts ?? held}
        total={over.total ?? '121050'}
        money={money}
        selected={over.selected ?? null}
        onSelect={over.onSelect ?? jest.fn()}
        onAdd={over.onAdd ?? jest.fn()}
        onRename={over.onRename ?? jest.fn()}
      />
    </LocaleProvider>,
  );
};

describe('the panel of accounts beside the feed', () => {
  it('carries every balance and what they hold together', () => {
    show();

    expect(screen.getByTestId('balance-a1')).toHaveTextContent('1,250.50');
    expect(screen.getByTestId('accounts-total')).toHaveTextContent('1,210.50');
  });

  it('paints a balance below zero red, which is the one amount that turns red here', () => {
    show();

    expect(screen.getByTestId('balance-a2').className).toContain('text-destructive');
    expect(screen.getByTestId('balance-a1').className).not.toContain('text-destructive');
  });

  it('says so when there are no accounts yet', () => {
    show({ accounts: [], total: '0' });

    expect(screen.getByText(en['accounts.empty'])).toBeInTheDocument();
  });

  it('picks one account, and picks them all back', async () => {
    const onSelect = jest.fn();
    show({ onSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Wallet' }));
    expect(onSelect).toHaveBeenCalledWith('a1');

    await userEvent.click(screen.getByRole('button', { name: en['transactions.allAccounts'] }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('keeps the pencil that renames an account', async () => {
    const onRename = jest.fn();
    show({ onRename });

    await userEvent.click(
      screen.getByRole('button', { name: en['accounts.renameOne'].replace('{{name}}', 'Wallet') }),
    );

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('opens the account form from the screen the money is on', async () => {
    const onAdd = jest.fn();
    show({ onAdd });

    await userEvent.click(screen.getByRole('button', { name: en['transactions.addAccount'] }));

    expect(onAdd).toHaveBeenCalled();
  });

  it('offers the account form beside the switcher, because a phone has no panel to put it in', () => {
    const onAdd = jest.fn();

    render(
      <LocaleProvider initialLocale="en">
        <AccountPanel
          accounts={held}
          total="121050"
          money={money}
          selected={null}
          variant="switcher"
          onSelect={jest.fn()}
          onAdd={onAdd}
          onRename={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('button', { name: en['transactions.addAccount'] })).toBeInTheDocument();
  });

  it('collapses to one switcher on a phone, where a column beside the feed does not fit', async () => {
    render(
      <LocaleProvider initialLocale="en">
        <AccountPanel
          accounts={held}
          total="121050"
          money={money}
          selected="a1"
          variant="switcher"
          onSelect={jest.fn()}
          onAdd={jest.fn()}
          onRename={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Wallet');
    expect(screen.getByRole('combobox')).toHaveTextContent('1,250.50');
    expect(screen.queryByText('Card')).not.toBeInTheDocument();
  });

  it('lists every account, the sum of them and the way to add one, once it is opened', async () => {
    const onSelect = jest.fn();

    render(
      <LocaleProvider initialLocale="en">
        <AccountPanel
          accounts={held}
          total="121050"
          money={money}
          selected={null}
          variant="switcher"
          onSelect={onSelect}
          onAdd={jest.fn()}
          onRename={jest.fn()}
        />
      </LocaleProvider>,
    );

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: /Card/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /Card/ }));

    expect(onSelect).toHaveBeenCalledWith('a2');
  });

  it('renames the chosen account on a phone, where the panel with the pencil is not there', async () => {
    const onRename = jest.fn();

    render(
      <LocaleProvider initialLocale="en">
        <AccountPanel
          accounts={held}
          total="121050"
          money={money}
          selected="a1"
          variant="switcher"
          onSelect={jest.fn()}
          onAdd={jest.fn()}
          onRename={onRename}
        />
      </LocaleProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: en['accounts.renameOne'].replace('{{name}}', 'Wallet') }),
    );

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('offers no rename while every account is shown at once', () => {
    render(
      <LocaleProvider initialLocale="en">
        <AccountPanel
          accounts={held}
          total="121050"
          money={money}
          selected={null}
          variant="switcher"
          onSelect={jest.fn()}
          onAdd={jest.fn()}
          onRename={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(
      screen.queryByRole('button', {
        name: en['accounts.renameOne'].replace('{{name}}', 'Wallet'),
      }),
    ).toBeNull();
  });

  it('says how many accounts there are beside the heading', () => {
    show();

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('(2)');
  });
});
