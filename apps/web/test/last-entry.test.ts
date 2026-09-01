import { NO_LAST_ENTRY, readLastEntry, storeLastEntry } from '@/lib/last-entry';

const BUDGET = 'b1';

const TODAY = '2026-08-25';

const TOMORROW = '2026-08-26';

beforeEach(() => {
  window.localStorage.clear();
});

describe('what the form opens with next time', () => {
  it('answers with nothing before a record has been written', () => {
    expect(readLastEntry(BUDGET, TODAY)).toEqual(NO_LAST_ENTRY);
  });

  it('gives back the day, the envelope and the payee of the last record', () => {
    storeLastEntry(BUDGET, { date: '2026-08-20', categoryId: 'c1', payee: 'Pharmacy' }, TODAY);

    expect(readLastEntry(BUDGET, TODAY)).toEqual({
      date: '2026-08-20',
      categoryId: 'c1',
      payee: 'Pharmacy',
    });
  });

  it('forgets the day once the next day has come, so a stale date is never typed over', () => {
    storeLastEntry(BUDGET, { date: '2026-08-20', categoryId: 'c1', payee: 'Pharmacy' }, TODAY);

    expect(readLastEntry(BUDGET, TOMORROW)).toEqual({
      date: null,
      categoryId: 'c1',
      payee: 'Pharmacy',
    });
  });

  it('forgets the day of a record stored before the day was written down at all', () => {
    window.localStorage.setItem(
      'rondo.lastEntry:b1',
      JSON.stringify({ date: '2026-08-20', categoryId: 'c1', payee: 'Pharmacy' }),
    );

    expect(readLastEntry(BUDGET, TODAY)).toMatchObject({ date: null, categoryId: 'c1' });
  });

  it('keeps one budget out of another, because their categories are different rows', () => {
    storeLastEntry(BUDGET, { date: '2026-08-25', categoryId: 'c1', payee: null }, TODAY);

    expect(readLastEntry('b2', TODAY)).toEqual(NO_LAST_ENTRY);
  });

  it('answers with nothing when what was stored is not a day', () => {
    window.localStorage.setItem(
      'rondo.lastEntry:b1',
      JSON.stringify({ date: 'yesterday', categoryId: 5, payee: '', storedOn: TODAY }),
    );

    expect(readLastEntry(BUDGET, TODAY)).toEqual(NO_LAST_ENTRY);
  });

  it('survives a stored value that is not an object at all', () => {
    window.localStorage.setItem('rondo.lastEntry:b1', 'nonsense');

    expect(readLastEntry(BUDGET, TODAY)).toEqual(NO_LAST_ENTRY);
  });
});
