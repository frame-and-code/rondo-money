import { inWriteOrder, wholeOrder } from '@/categories/write-order';

const IDS = [
  '0199c1a8-9ecf-71c7-a617-c575df073712',
  '0199c1a8-9ecf-71c7-a617-c575df073710',
  '0199c1a8-9ecf-71c7-a617-c575df073711',
];

describe('the order a reordering writes its rows in', () => {
  it('gives each id the position the caller asked for', () => {
    expect(inWriteOrder(IDS)).toEqual(
      expect.arrayContaining([
        { id: IDS[0], sortOrder: 0 },
        { id: IDS[1], sortOrder: 1 },
        { id: IDS[2], sortOrder: 2 },
      ]),
    );
  });

  it('writes them by id rather than by position, so two opposite requests cannot deadlock', () => {
    const forward = inWriteOrder(IDS);
    const backward = inWriteOrder([...IDS].reverse());

    expect(forward.map((row) => row.id)).toEqual([...IDS].sort());
    expect(backward.map((row) => row.id)).toEqual([...IDS].sort());
  });
});

describe('the order a partial reordering leaves behind', () => {
  const held = [
    { id: IDS[0] ?? '', sortOrder: 2 },
    { id: IDS[2] ?? '', sortOrder: 1 },
    { id: IDS[1] ?? '', sortOrder: 0 },
  ];

  it('puts the named ids first, in the order they were named', () => {
    expect(wholeOrder([IDS[0] ?? '', IDS[2] ?? ''], held).slice(0, 2)).toEqual([IDS[0], IDS[2]]);
  });

  it(
    'keeps the rows nobody named behind them, by the order they already had and not by the ' +
      'order the database happened to return them in',
    () => {
      expect(wholeOrder([IDS[0] ?? ''], held)).toEqual([IDS[0], IDS[1], IDS[2]]);
    },
  );

  it('loses nothing, whatever subset was named', () => {
    for (const asked of [[], [IDS[1] ?? ''], [IDS[2] ?? '', IDS[1] ?? '']]) {
      expect([...wholeOrder(asked, held)].sort()).toEqual([...IDS].sort());
    }
  });
});
