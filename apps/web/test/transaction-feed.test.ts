import { feedDays, type FeedRecord } from '@/lib/transaction-feed';

const TODAY = '2026-08-31';

const record = (over: Partial<FeedRecord> = {}): FeedRecord => ({
  id: 'r1',
  accountId: 'a1',
  categoryId: 'c1',
  date: TODAY,
  amount: '-1000',
  type: 'EXPENSE',
  payee: 'Кофейня на углу',
  isSystem: false,
  transferId: null,
  counterAccountId: null,
  createdAt: '2026-08-31T09:00:00.000Z',
  ...over,
});

describe('grouping what a budget recorded into days', () => {
  it('keeps the order it was given and puts each record under its own day', () => {
    const days = feedDays(
      [
        record({ id: 'r1', date: '2026-08-31' }),
        record({ id: 'r2', date: '2026-08-30' }),
        record({ id: 'r3', date: '2026-08-30' }),
      ],
      [
        { date: '2026-08-31', total: '-1000' },
        { date: '2026-08-30', total: '-2000' },
      ],
      TODAY,
    );

    expect(days.map((day) => day.date)).toEqual(['2026-08-31', '2026-08-30']);
    expect(days.map((day) => day.records.map((row) => row.id))).toEqual([['r1'], ['r2', 'r3']]);
  });

  it('carries the total the server counted, not the sum of the records it was handed', () => {
    const days = feedDays(
      [record({ id: 'r1', date: '2026-08-30', amount: '-1000' })],
      [{ date: '2026-08-30', total: '-9000' }],
      TODAY,
    );

    expect(days[0]?.total).toBe('-9000');
  });

  it('names today and yesterday, and leaves any other day to be spelled out', () => {
    const days = feedDays(
      [
        record({ id: 'r1', date: '2026-08-31' }),
        record({ id: 'r2', date: '2026-08-30' }),
        record({ id: 'r3', date: '2026-08-29' }),
      ],
      [],
      TODAY,
    );

    expect(days.map((day) => day.name)).toEqual(['today', 'yesterday', null]);
  });

  it('answers with nothing when there is nothing to show', () => {
    expect(feedDays([], [], TODAY)).toEqual([]);
  });

  it('falls back to nothing for a day the server sent no total for', () => {
    const days = feedDays([record({ date: '2026-08-30' })], [], TODAY);

    expect(days[0]?.total).toBe('0');
  });
});
