import { reordered, reorderedView } from '@/lib/category-order';

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
