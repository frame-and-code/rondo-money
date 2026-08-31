import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PayeeField } from '@/components/payee-field';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const PAYEES = ['Bakery', 'Chemist', 'Cinema', 'Corner cafe', 'Dentist', 'Florist', 'Grocer'];

function Field({ value = '', onChange = jest.fn() }: { value?: string; onChange?: () => void }) {
  return (
    <LocaleProvider initialLocale="en">
      <PayeeField
        id="payee"
        label={en['transactions.payeeExpense']}
        placeholder={en['transactions.payeeHintExpense']}
        value={value}
        payees={PAYEES}
        onChange={onChange}
      />
    </LocaleProvider>
  );
}

const open = async (): Promise<HTMLElement> => {
  const user = userEvent.setup();

  await user.click(screen.getByRole('combobox'));

  return screen.findByPlaceholderText(en['transactions.payeeHintExpense']);
};

describe('the field a payee is typed into', () => {
  it('shows what was chosen, and offers the names when it is opened', async () => {
    render(<Field value="Bakery" />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Bakery');

    await open();

    expect(await screen.findAllByRole('option')).toHaveLength(6);
  });

  it('offers no more than six names at once, because a list is not a screen', async () => {
    render(<Field />);
    await open();

    expect(await screen.findAllByRole('option')).toHaveLength(6);
  });

  it('offers to add a name the budget has not seen', async () => {
    const onChange = jest.fn();
    render(<Field onChange={onChange} />);

    const search = await open();
    await userEvent.type(search, 'Kiosk');

    const add = await screen.findByRole('option', {
      name: en['transactions.payeeAdd'].replace('{{name}}', 'Kiosk'),
    });
    await userEvent.click(add);

    expect(onChange).toHaveBeenCalledWith('Kiosk');
  });

  it('does not offer to add a name that is already there', async () => {
    render(<Field />);
    const search = await open();

    await userEvent.type(search, 'Bakery');

    expect(await screen.findByRole('option', { name: 'Bakery' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', {
        name: en['transactions.payeeAdd'].replace('{{name}}', 'Bakery'),
      }),
    ).toBeNull();
  });

  it('takes a name of a hundred characters and no more', async () => {
    render(<Field />);
    const search = await open();

    expect(search).toHaveAttribute('maxlength', '100');
  });

  it('puts the caret in the search box, because opening it is asking to type', async () => {
    render(<Field />);

    const search = await open();

    expect(search).toHaveFocus();
  });

  it('takes a new name straight from the keyboard, because typing it is the whole intent', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Field onChange={onChange} />);

    const search = await open();
    await user.type(search, 'Kiosk');

    await screen.findByRole('option', {
      name: en['transactions.payeeAdd'].replace('{{name}}', 'Kiosk'),
    });
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('Kiosk');
  });
});
