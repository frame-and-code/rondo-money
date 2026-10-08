import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeleteNetWorthItemDialog } from '@/components/delete-net-worth-item-dialog';
import { type NetWorthEntity } from '@/components/net-worth-item-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const show = (
  over: {
    entity?: NetWorthEntity;
    failed?: boolean;
    refusals?: number;
    busy?: boolean;
    onDelete?: () => void;
  } = {},
) => {
  const onDelete = over.onDelete ?? jest.fn();
  const onCancel = jest.fn();

  const view = (next: typeof over) => (
    <LocaleProvider initialLocale="en">
      <DeleteNetWorthItemDialog
        entity={next.entity ?? 'asset'}
        name="Car"
        amount="PLN 48,000.00"
        failed={next.failed ?? false}
        refusals={next.refusals ?? 0}
        busy={next.busy ?? false}
        onDelete={onDelete}
        onCancel={onCancel}
      />
    </LocaleProvider>
  );

  const { rerender } = render(view(over));

  return { onDelete, onCancel, again: (next: typeof over) => rerender(view({ ...over, ...next })) };
};

const remove = () => screen.getByRole('button', { name: en['netWorth.delete'] });

describe('confirming that something owned or owed goes away', () => {
  it('names an asset and says net worth goes down by what it was worth', () => {
    show({ entity: 'asset' });

    expect(
      screen.getByRole('heading', {
        name: en['netWorth.deleteAssetTitle'].replace('{{name}}', 'Car'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en['netWorth.deleteAssetLine'].replace('{{amount}}', 'PLN 48,000.00')),
    ).toBeInTheDocument();
    expect(screen.getByText(en['netWorth.deleteNote'])).toBeInTheDocument();
  });

  it('names a liability and says net worth goes up by what was owed', () => {
    show({ entity: 'liability' });

    expect(
      screen.getByRole('heading', {
        name: en['netWorth.deleteLiabilityTitle'].replace('{{name}}', 'Car'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en['netWorth.deleteLiabilityLine'].replace('{{amount}}', 'PLN 48,000.00')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(en['netWorth.deleteAssetLine'].replace('{{amount}}', 'PLN 48,000.00')),
    ).not.toBeInTheDocument();
  });

  it('asks once, however many times the button is pressed before the answer comes', async () => {
    const { onDelete } = show();

    await userEvent.click(remove());
    await userEvent.click(remove());

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('takes no press while the request is out', async () => {
    const { onDelete } = show({ busy: true });

    expect(remove()).toBeDisabled();

    await userEvent.click(remove());

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('says a failure in the same alert the form uses, and lets the same press be tried again', async () => {
    const { onDelete, again } = show();

    await userEvent.click(remove());
    again({ failed: true, refusals: 1 });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(en['netWorth.failTitle']);
    expect(alert).toHaveTextContent(en['netWorth.failBody']);

    await userEvent.click(remove());

    expect(onDelete).toHaveBeenCalledTimes(2);

    again({ failed: true, refusals: 2 });
    await userEvent.click(remove());

    expect(onDelete).toHaveBeenCalledTimes(3);
  });

  it('walks away without deleting anything', async () => {
    const { onDelete, onCancel } = show();

    await userEvent.click(screen.getByRole('button', { name: en['netWorth.cancel'] }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
