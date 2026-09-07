import type { BudgetViewCategoryDto } from '@rondo/types';
import { render, screen } from '@testing-library/react';

import { CategoryGroup } from '@/components/category-group';
import { CategoryTile } from '@/components/category-tile';
import { LocaleProvider } from '@/i18n/locale-context';
import { moneyOf } from '@/lib/money';

import type * as DndSortable from '@dnd-kit/sortable';

jest.mock('@dnd-kit/sortable', () => {
  const actual: typeof DndSortable = jest.requireActual('@dnd-kit/sortable');

  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      setActivatorNodeRef: () => {},
      transform: { x: 0, y: 24, scaleX: 0.54, scaleY: 0.54 },
      transition: 'transform 200ms ease',
      isDragging: true,
    }),
  };
});

const category: BudgetViewCategoryDto = {
  id: 'c1',
  name: 'Rent',
  icon: 'home',
  color: 'blue',
  assigned: '48000',
  activity: '0',
  available: '48000',
  availableAllTime: '48000',
  hidden: false,
  paid: false,
  target: null,
};

describe('what a card carries while it is dragged', () => {
  it('moves without being resized, so the group it sits in keeps its height', () => {
    render(
      <LocaleProvider>
        <CategoryTile
          category={category}
          money={moneyOf('en-US', 'USD', 2, { signed: true })}
          failed={false}
          moveOpen={false}
          movePanel={null}
          moveInPopover
          onMoveOpen={() => {}}
          onMoveClose={() => {}}
        />
      </LocaleProvider>,
    );

    const frame = screen.getByTestId('category-tile-Rent');

    expect(frame).toHaveStyle({ transform: 'translate3d(0px, 24px, 0)' });
    expect(frame.getAttribute('style')).not.toMatch(/scale/i);
  });
});

describe('what a group carries while it is dragged', () => {
  it('moves without being resized, so its cards keep the size they are read at', () => {
    render(
      <LocaleProvider>
        <CategoryGroup
          id="g1"
          name="Bills"
          available="0 $"
          categoryIds={['c1']}
          onAdd={() => {}}
          onRename={() => {}}
          onHide={() => {}}
          onReorder={() => {}}
        >
          <div data-testid="tile" />
        </CategoryGroup>
      </LocaleProvider>,
    );

    const section = screen.getByTestId('category-group-g1');

    expect(section).toHaveStyle({ transform: 'translate3d(0px, 24px, 0)' });
    expect(section.getAttribute('style')).not.toMatch(/scale/i);
  });
});
