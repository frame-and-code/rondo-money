import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryGroup } from '@/components/category-group';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';

const onAdd = jest.fn();

const draw = (categoryIds: string[], sortable = true) =>
  render(
    <LocaleProvider>
      <DndContext>
        <SortableContext items={['g1']}>
          <CategoryGroup
            id="g1"
            name="Bills"
            available="0 zł"
            categoryIds={categoryIds}
            sortable={sortable}
            onAdd={onAdd}
            onRename={() => {}}
            onHide={() => {}}
            onReorder={() => {}}
          >
            {categoryIds.map((id) => (
              <div key={id} data-testid={`tile-${id}`} />
            ))}
          </CategoryGroup>
        </SortableContext>
      </DndContext>
    </LocaleProvider>,
  );

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('a group with nothing in it', () => {
  it('shows a card that adds a category where a category would be', () => {
    draw([]);

    const card = screen.getByTestId('empty-group-g1');
    expect(card).toHaveTextContent(en['categories.emptyGroupAdd']);
    expect(card).toHaveAccessibleName(en['categories.addTo'].replace('{{group}}', 'Bills'));
    expect(card.tagName).toBe('BUTTON');
  });

  it('opens the same dialog as the plus in the header, so there is one way in', async () => {
    const user = userEvent.setup();
    draw([]);

    await user.click(screen.getByTestId('empty-group-g1'));
    await user.click(
      screen.getAllByRole('button', {
        name: en['categories.addTo'].replace('{{group}}', 'Bills'),
      })[0] as HTMLElement,
    );

    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('reaches the card from the keyboard', async () => {
    const user = userEvent.setup();
    draw([]);

    screen.getByTestId('empty-group-g1').focus();
    await user.keyboard('{Enter}');

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('draws no card once the group holds a category', () => {
    draw(['c1']);

    expect(screen.queryByTestId('empty-group-g1')).not.toBeInTheDocument();
    expect(screen.getByTestId('tile-c1')).toBeInTheDocument();
  });
});

describe('the handle a group is dragged by', () => {
  it('sits in the header and names the group', () => {
    draw(['c1']);

    expect(
      screen.getByRole('button', {
        name: en['categories.reorderGroup'].replace('{{group}}', 'Bills'),
      }),
    ).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('is gone while the screen is filtered, when the order shown is not the order kept', () => {
    draw(['c1'], false);

    expect(
      screen.queryByRole('button', {
        name: en['categories.reorderGroup'].replace('{{group}}', 'Bills'),
      }),
    ).not.toBeInTheDocument();
  });
});
