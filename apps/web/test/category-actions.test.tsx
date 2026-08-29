import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryActions } from '@/components/category-actions';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const onEdit = jest.fn();
const onHide = jest.fn();

const draw = () =>
  render(
    <LocaleProvider>
      <CategoryActions
        category={{ id: 'c1', name: 'Кафе и рестораны' }}
        onEdit={onEdit}
        onHide={onHide}
      />
    </LocaleProvider>,
  );

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('the actions under the move fields', () => {
  it('keeps the actions folded away until the row is opened', () => {
    draw();

    expect(screen.getByRole('button', { name: en['categories.manage'] })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: en['categories.edit'] })).not.toBeInTheDocument();
  });

  it('unfolds every action the category has, and no other', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    for (const label of [en['categories.edit'], en['categories.hide']]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('offers one way into the dialog rather than three that open the same one', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('sends each row to its own dialog', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    await user.click(screen.getByRole('button', { name: en['categories.edit'] }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: en['categories.hide'] }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('offers nothing that deletes the category', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: en['categories.manage'] }));

    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/delete|Delete|remove|Remove/);
    }
  });
});
