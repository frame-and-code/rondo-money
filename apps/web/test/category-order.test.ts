import {
  reordered,
  reorderedGroups,
  reorderedView,
  shownOrder,
  storedOrder,
} from '@/lib/category-order';

const IDS = ['a', 'b', 'c', 'd'];

describe('the order a dragged category lands in', () => {
  it('puts a category dragged down after the one it was dropped on', () => {
    expect(reordered(IDS, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('puts a category dragged up before the one it was dropped on', () => {
    expect(reordered(IDS, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('changes nothing when a category is dropped where it already was', () => {
    expect(reordered(IDS, 2, 2)).toEqual(IDS);
  });

  it('keeps every id exactly once, so a drop can never lose a category', () => {
    for (let from = 0; from < IDS.length; from += 1) {
      for (let to = 0; to < IDS.length; to += 1) {
        expect([...reordered(IDS, from, to)].sort()).toEqual([...IDS].sort());
      }
    }
  });

  it('refuses an index outside the list rather than dropping the category', () => {
    expect(() => reordered(IDS, -1, 0)).toThrow();
    expect(() => reordered(IDS, 0, IDS.length)).toThrow();
  });
});

const viewOf = () => ({
  month: '2026-02',
  groups: [
    { id: 'g1', categories: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    { id: 'g2', categories: [{ id: 'd' }] },
  ],
});

describe('the month a drop leaves on the screen before the server answers', () => {
  it('puts the group the drop landed in into the order it asked for', () => {
    const after = reorderedView(viewOf(), 'g1', ['c', 'a', 'b']);

    expect(after.groups[0]?.categories.map((one) => one.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves every other group exactly as it was', () => {
    const before = viewOf();
    const after = reorderedView(before, 'g1', ['c', 'a', 'b']);

    expect(after.groups[1]).toBe(before.groups[1]);
  });

  it('changes nothing when the order names a group the month does not hold', () => {
    const before = viewOf();

    expect(reorderedView(before, 'g9', ['a']).groups).toEqual(before.groups);
  });

  it('changes nothing when the order is not the whole group, so the screen never loses a card', () => {
    const before = viewOf();

    expect(reorderedView(before, 'g1', ['c', 'a']).groups[0]?.categories).toEqual(
      before.groups[0]?.categories,
    );
  });
});

describe('reorderedGroups', () => {
  const view = {
    groups: [
      { id: 'g1', name: 'Дом' },
      { id: 'g2', name: 'Еда' },
      { id: 'g3', name: 'Досуг' },
    ],
  };

  it('puts the groups in the order the drop left them', () => {
    expect(reorderedGroups(view, ['g3', 'g1', 'g2']).groups.map((one) => one.id)).toEqual([
      'g3',
      'g1',
      'g2',
    ]);
  });

  it('leaves the view alone when the order names a group it does not hold', () => {
    expect(reorderedGroups(view, ['g3', 'g1', 'nope'])).toBe(view);
  });
});

describe('shownOrder', () => {
  it('moves the paid categories behind the open ones and keeps each half in its order', () => {
    const shown = shownOrder([
      { id: 'a', paid: true },
      { id: 'b', paid: false },
      { id: 'c', paid: true },
      { id: 'd', paid: false },
    ]);

    expect(shown.map((one) => one.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('storedOrder', () => {
  const paid = new Set(['p']);

  it('writes a drop among the open categories back without moving a paid one', () => {
    expect(storedOrder(['a', 'b', 'c', 'p'], paid, ['b', 'c', 'a', 'p'])).toEqual([
      'b',
      'c',
      'a',
      'p',
    ]);
  });

  it('keeps a paid category in its stored slot, so next month the order is what it was', () => {
    expect(storedOrder(['p', 'a', 'b', 'c'], paid, ['b', 'c', 'a', 'p'])).toEqual([
      'p',
      'b',
      'c',
      'a',
    ]);
  });

  it('refuses a shown order naming other categories than the stored one', () => {
    expect(() => storedOrder(['a', 'b'], paid, ['a', 'x'])).toThrow(/different categories/);
  });
});
