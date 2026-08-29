import { CATEGORY_COLORS, CATEGORY_ICONS } from '@rondo/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryDialog } from '@/components/category-dialog';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const onSave = jest.fn();
const onCancel = jest.fn();

const GROUPS = [
  { id: 'g1', name: 'Дом' },
  { id: 'g2', name: 'Досуг' },
];

const draw = (category: Parameters<typeof CategoryDialog>[0]['category'] = null) =>
  render(
    <LocaleProvider>
      <CategoryDialog
        category={category}
        failed={null}
        groupId={category?.groupId ?? 'g2'}
        groups={GROUPS}
        onSave={onSave}
        onCancel={onCancel}
      />
    </LocaleProvider>,
  );

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

const openTheLook = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: en['categories.lookPick'] }));
};

describe('the dialog a category is set up in', () => {
  it('keeps the sets behind the icon rather than spending the dialog on them', () => {
    draw();

    expect(screen.queryByTestId('icon-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('color-blue')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['categories.lookPick'] })).toBeInTheDocument();
  });

  it('puts the caret in the name straight away, with the caret after what is there', () => {
    draw({ id: 'c1', name: 'Кафе', groupId: 'g1', icon: 'coffee', color: 'rose' });

    const field = screen.getByLabelText(en['categories.nameLabel']);

    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionStart).toBe('Кафе'.length);
  });

  it('offers every icon and every colour the API accepts', async () => {
    const user = userEvent.setup();
    draw();

    await openTheLook(user);

    expect(screen.getAllByTestId(/^icon-/)).toHaveLength(CATEGORY_ICONS.length);
    expect(screen.getAllByTestId(/^color-/)).toHaveLength(CATEGORY_COLORS.length);
  });

  it('creates the category in the group whose plus was pressed', async () => {
    const user = userEvent.setup();
    draw();

    await user.type(screen.getByLabelText(en['categories.nameLabel']), 'Выходные');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g2' }));
  });

  it('saves the name, the group, the icon and the colour the user picked', async () => {
    const user = userEvent.setup();
    draw({ id: 'c1', name: 'Кафе', groupId: 'g1', icon: 'coffee', color: 'rose' });

    await user.clear(screen.getByLabelText(en['categories.nameLabel']));
    await user.type(screen.getByLabelText(en['categories.nameLabel']), 'Кафе и рестораны');
    await openTheLook(user);
    await user.click(screen.getByTestId('icon-restaurant'));
    await user.click(screen.getByTestId('color-vermilion'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Кафе и рестораны',
        groupId: 'g1',
        icon: 'restaurant',
        color: 'vermilion',
      }),
    );
  });

  it('moves the category to another group through the picker', async () => {
    const user = userEvent.setup();
    draw({ id: 'c1', name: 'Кафе', groupId: 'g1', icon: null, color: null });

    await user.click(screen.getByRole('combobox', { name: en['categories.groupLabel'] }));
    await user.click(await screen.findByRole('option', { name: 'Досуг' }));
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g2' }));
  });

  it('mints one key when it opens, so a double submit writes once', async () => {
    const user = userEvent.setup();
    draw({ id: 'c1', name: 'Кафе', groupId: 'g1', icon: 'coffee', color: 'rose' });

    const save = screen.getByRole('button', { name: en['categories.save'] });
    await user.click(save);
    await user.click(save);

    const keys = onSave.mock.calls.map(
      ([draft]: [{ idempotencyKey: string }]) => draft.idempotencyKey,
    );

    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toEqual(expect.any(String));
  });

  it('says why a save was refused instead of closing on silence', () => {
    render(
      <LocaleProvider>
        <CategoryDialog
          category={null}
          failed="categories.failGroupHidden"
          groupId="g1"
          groups={GROUPS}
          onSave={onSave}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(en['categories.failGroupHidden']);
  });

  it('refuses to save a category with no name', async () => {
    const user = userEvent.setup();
    draw({ id: 'c1', name: 'Кафе', groupId: 'g1', icon: null, color: null });

    await user.clear(screen.getByLabelText(en['categories.nameLabel']));

    expect(screen.getByRole('button', { name: en['categories.save'] })).toBeDisabled();
  });
});
