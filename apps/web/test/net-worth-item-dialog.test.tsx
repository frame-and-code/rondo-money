import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  NetWorthItemDialog,
  type NetWorthEntity,
  type NetWorthItem,
  type NetWorthItemDraft,
} from '@/components/net-worth-item-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf, type MoneyReader } from '@/lib/money';
import { type SaveFailureKind } from '@/lib/save-failure';

const money = moneyOf('en-US', 'PLN', 2);

const TODAY = '2026-08-20';

const flat: NetWorthItem = { id: 'i1', name: 'Flat', amount: '50000000', date: '2026-03-12' };

const show = (
  over: {
    entity?: NetWorthEntity;
    item?: NetWorthItem | null;
    money?: MoneyReader;
    failure?: SaveFailureKind | null;
    busy?: boolean;
    frozen?: boolean;
    onSave?: (draft: NetWorthItemDraft) => void;
    onEdited?: () => void;
  } = {},
) => {
  const onSave = over.onSave ?? jest.fn();
  const onEdited = over.onEdited ?? jest.fn();
  const onCancel = jest.fn();

  const view = (next: typeof over) => (
    <LocaleProvider initialLocale="en">
      <NetWorthItemDialog
        entity={next.entity ?? 'asset'}
        item={next.item ?? null}
        money={next.money ?? money}
        today={TODAY}
        failure={next.failure ?? null}
        busy={next.busy ?? false}
        frozen={next.frozen ?? false}
        onSave={onSave}
        onEdited={onEdited}
        onCancel={onCancel}
      />
    </LocaleProvider>
  );

  const { rerender } = render(view(over));

  return {
    onSave,
    onEdited,
    onCancel,
    again: (next: typeof over) => rerender(view({ ...over, ...next })),
  };
};

const nameField = () => screen.getByLabelText(en['netWorth.nameLabel']);
const amountField = () => screen.getByLabelText(en['netWorth.amountLabel']);
const save = () => screen.getByRole('button', { name: en['netWorth.save'] });

const sent = (onSave: unknown, call = 0): NetWorthItemDraft =>
  (onSave as jest.Mock).mock.calls[call]?.[0] as NetWorthItemDraft;

describe('writing down something owned or owed', () => {
  it('sends the name without its edges, the amount in minor units, the day and one key', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), '  Garage  ');
    await userEvent.type(amountField(), '4500.50');
    await userEvent.click(save());

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(sent(onSave)).toEqual({
      name: 'Garage',
      amount: '450050',
      date: TODAY,
      idempotencyKey: expect.any(String),
    });
    expect(sent(onSave).idempotencyKey).not.toBe('');
  });

  it('opens a new one on the day it was told is today', () => {
    show();

    expect(screen.getByRole('button', { name: /20 August 2026/ })).toBeInTheDocument();
  });

  it('takes the day picked in the calendar, and offers no day after today', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.type(amountField(), '1');
    await userEvent.click(screen.getByRole('button', { name: /20 August 2026/ }));

    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /August 21st, 2026/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: en['common.calendarNext'] })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /August 10th, 2026/ }));
    await userEvent.click(save());

    expect(sent(onSave).date).toBe('2026-08-10');
  });

  it('takes an amount of nothing, and writes nothing from a field nobody typed in', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();

    await userEvent.type(amountField(), '0');
    await userEvent.click(save());

    expect(sent(onSave).amount).toBe('0');
  });

  it('does not write an amount that was typed and then cleared', async () => {
    const { onSave } = show({ item: flat });

    await userEvent.clear(amountField());
    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds up an expression, and does not send one nobody finished typing', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.type(amountField(), '434+');
    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();

    await userEvent.clear(amountField());
    await userEvent.type(amountField(), '4000+500');
    await userEvent.click(save());

    expect(sent(onSave).amount).toBe('450000');
  });

  it('says an amount cannot come out below zero, in words about an amount, and does not send it', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.type(amountField(), '100-200');

    expect(screen.getByText(en['netWorth.amountNegative'])).toBeInTheDocument();
    expect(screen.queryByText(en['newAccount.balanceNegative'])).not.toBeInTheDocument();

    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not send a name of nothing but spaces', async () => {
    const { onSave } = show();

    await userEvent.type(nameField(), '   ');
    await userEvent.type(amountField(), '1');
    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('changing one already written down', () => {
  it('opens on its name, its amount with every decimal, and its day', () => {
    show({ item: flat });

    expect(nameField()).toHaveValue('Flat');
    expect(amountField()).toHaveValue(money.typed(50_000_000n));
    expect(screen.getByRole('button', { name: /12 March 2026/ })).toBeInTheDocument();
  });

  it('sends the day again when nobody touched it, because the body is the whole record', async () => {
    const { onSave } = show({ item: flat });

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Bigger flat');
    await userEvent.click(save());

    expect(sent(onSave)).toMatchObject({
      name: 'Bigger flat',
      amount: '50000000',
      date: '2026-03-12',
    });
  });

  it('opens one that carries no day on today, so the form always sends one', async () => {
    const { onSave } = show({ item: { ...flat, date: null } });

    expect(screen.getByRole('button', { name: /20 August 2026/ })).toBeInTheDocument();

    await userEvent.click(save());

    expect(sent(onSave).date).toBe(TODAY);
  });

  it('renders the amount under a currency that carries no minor digits', () => {
    const yen = moneyOf('en-US', 'JPY', 0);

    show({ item: { ...flat, amount: '5000' }, money: yen });

    expect(amountField()).toHaveValue(yen.typed(5_000n));
    expect(amountField()).not.toHaveValue(money.typed(5_000n));
  });
});

describe('a form whose request went wrong', () => {
  it.each(['network', 'conflict', 'budget', 'other'] as const)(
    'says so in the same alert when the failure is %s',
    (failure) => {
      const { again } = show({ item: flat, failure });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(en['netWorth.failTitle']);
      expect(alert).toHaveTextContent(en['netWorth.failBody']);

      again({ failure: null });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('keeps what was typed and the same key when the answer never arrived, and freezes the fields', async () => {
    const { onSave, again } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.type(amountField(), '1');
    await userEvent.click(save());

    again({ failure: 'network', frozen: true });

    expect(nameField()).toBeDisabled();
    expect(amountField()).toBeDisabled();
    expect(nameField()).toHaveValue('Garage');

    await userEvent.click(save());

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(sent(onSave, 1).idempotencyKey).toBe(sent(onSave, 0).idempotencyKey);
  });

  it('mints a new key once a refusal the server recorded is followed by an edit', async () => {
    const { onSave, onEdited, again } = show();

    await userEvent.type(nameField(), 'Garage');
    await userEvent.type(amountField(), '1');
    await userEvent.click(save());

    again({ failure: 'other' });

    expect(nameField()).toHaveValue('Garage');
    expect(nameField()).not.toBeDisabled();

    await userEvent.type(nameField(), ' door');

    expect(onEdited).toHaveBeenCalled();

    await userEvent.click(save());

    expect(sent(onSave, 1).name).toBe('Garage door');
    expect(sent(onSave, 1).idempotencyKey).not.toBe(sent(onSave, 0).idempotencyKey);
  });

  it('does not take a second press while the first request is still out', async () => {
    const { onSave } = show({ item: flat, busy: true });

    expect(save()).toBeDisabled();

    await userEvent.click(save());

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('what the form is called', () => {
  it.each([
    ['asset', null, 'netWorth.newAsset'],
    ['asset', flat, 'netWorth.editAsset'],
    ['liability', null, 'netWorth.newLiability'],
    ['liability', flat, 'netWorth.editLiability'],
  ] as const)('names a %s form by what it does', (entity, item, title) => {
    show({ entity, item });

    expect(screen.getByRole('heading', { name: en[title] })).toBeInTheDocument();
  });
});
