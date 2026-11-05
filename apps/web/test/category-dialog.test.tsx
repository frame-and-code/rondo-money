import { CATEGORY_COLORS, CATEGORY_ICONS } from '@rondo/types';
import { cleanup, render, screen, within } from '@testing-library/react';
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

const ACCOUNTS = [
  { id: 'a1', name: 'Card' },
  { id: 'a2', name: 'Cash' },
];

const draw = (category: Parameters<typeof CategoryDialog>[0]['category'] = null) =>
  render(
    <LocaleProvider>
      <CategoryDialog
        category={category}
        failed={null}
        groupId={category?.groupId ?? 'g2'}
        groups={GROUPS}
        accounts={ACCOUNTS}
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
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: 'coffee',
      color: 'rose',
      defaultAccountId: null,
    });

    const field = screen.getByLabelText(en['categories.nameLabel']);

    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionStart).toBe('Кафе'.length);
  });

  it('names every option, so the picker is usable without seeing it', async () => {
    const user = userEvent.setup();
    draw();

    await openTheLook(user);

    for (const one of CATEGORY_ICONS) {
      expect(
        within(screen.getByTestId(`icon-${one}`)).getByRole('radio', {
          name: en[`categoryIcon.${one}`],
        }),
      ).toBeInTheDocument();
    }

    for (const one of CATEGORY_COLORS) {
      expect(
        within(screen.getByTestId(`color-${one}`)).getByRole('radio', {
          name: en[`categoryColor.${one}`],
        }),
      ).toBeInTheDocument();
    }
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
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: 'coffee',
      color: 'rose',
      defaultAccountId: null,
    });

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
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: null,
      color: null,
      defaultAccountId: null,
    });

    await user.click(screen.getByRole('combobox', { name: en['categories.groupLabel'] }));
    await user.click(await screen.findByRole('option', { name: 'Досуг' }));
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g2' }));
  });

  it('mints one key when it opens, so a double submit writes once', async () => {
    const user = userEvent.setup();
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: 'coffee',
      color: 'rose',
      defaultAccountId: null,
    });

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
          accounts={ACCOUNTS}
          onSave={onSave}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(en['categories.failGroupHidden']);
  });

  it('refuses to save a category with no name', async () => {
    const user = userEvent.setup();
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: null,
      color: null,
      defaultAccountId: null,
    });

    await user.clear(screen.getByLabelText(en['categories.nameLabel']));

    expect(screen.getByRole('button', { name: en['categories.save'] })).toBeDisabled();
  });
});

describe('the default account of a category', () => {
  const editing = (defaultAccountId: string | null) =>
    draw({
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: 'coffee',
      color: 'rose',
      defaultAccountId,
    });

  it('sits third, after the name and the group', () => {
    editing(null);

    const fields = [
      screen.getByLabelText(en['categories.nameLabel']),
      screen.getByRole('combobox', { name: en['categories.groupLabel'] }),
      screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }),
    ];

    for (const [index, field] of fields.entries()) {
      const next = fields[index + 1];
      if (next) {
        expect(field.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  });

  it('shows the account the category holds, or none when it holds nothing', () => {
    editing('a2');
    expect(
      screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }),
    ).toHaveTextContent('Cash');

    cleanup();
    editing(null);
    expect(
      screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }),
    ).toHaveTextContent(en['categories.defaultAccountNone']);
  });

  it('offers no account first, then the accounts it was given and nothing else', async () => {
    const user = userEvent.setup();
    editing(null);

    await user.click(screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }));

    expect((await screen.findAllByRole('option')).map((one) => one.textContent)).toEqual([
      en['categories.defaultAccountNone'],
      'Card',
      'Cash',
    ]);
  });

  it('saves the account picked, and saves none when none is picked', async () => {
    const user = userEvent.setup();
    editing(null);

    await user.click(screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }));
    await user.click(await screen.findByRole('option', { name: 'Cash' }));
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ defaultAccountId: 'a2' }));

    cleanup();
    editing('a2');
    await user.click(screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }));
    await user.click(
      await screen.findByRole('option', { name: en['categories.defaultAccountNone'] }),
    );
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ defaultAccountId: null }));
  });

  it('leaves the account out of a save when the user never touched it, even if the category moved on meanwhile', async () => {
    const user = userEvent.setup();
    const held = {
      id: 'c1',
      name: 'Кафе',
      groupId: 'g1',
      icon: null,
      color: null,
      defaultAccountId: 'a2',
    };
    const { rerender } = draw(held);

    rerender(
      <LocaleProvider>
        <CategoryDialog
          category={{ ...held, defaultAccountId: 'a1' }}
          failed={null}
          groupId="g1"
          groups={GROUPS}
          accounts={ACCOUNTS}
          onSave={onSave}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );
    await user.type(screen.getByLabelText(en['categories.nameLabel']), ' и чай');
    await user.click(screen.getByRole('button', { name: en['categories.save'] }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Кафе и чай' }));
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('defaultAccountId');
  });

  it('does not call an account it has not read yet "no account"', () => {
    render(
      <LocaleProvider>
        <CategoryDialog
          category={{
            id: 'c1',
            name: 'Кафе',
            groupId: 'g1',
            icon: null,
            color: null,
            defaultAccountId: 'a2',
          }}
          failed={null}
          groupId="g1"
          groups={GROUPS}
          accounts={[]}
          onSave={onSave}
          onCancel={onCancel}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }),
    ).not.toHaveTextContent(en['categories.defaultAccountNone']);
  });

  it('is not asked when a category is created', () => {
    draw(null);

    expect(
      screen.queryByRole('combobox', { name: en['categories.defaultAccountLabel'] }),
    ).not.toBeInTheDocument();
  });
});
