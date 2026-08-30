import { activeInMonth, liveTarget, targetWrite, type TargetRow } from '@/categories/target-window';

const row = (over: Partial<TargetRow> = {}): TargetRow => ({
  id: 'target-a',
  kind: 'CONTRIBUTE',
  startMonth: '2026-08',
  dueMonth: null,
  endMonth: null,
  ...over,
});

describe('the goal a month is read with', () => {
  const older = row({ id: 'older', startMonth: '2026-05' });
  const newer = row({ id: 'newer', startMonth: '2026-08' });

  it('is the last one started no later than that month', () => {
    expect(activeInMonth([older, newer], '2026-09')?.id).toBe('newer');
    expect(activeInMonth([older, newer], '2026-06')?.id).toBe('older');
  });

  it('is absent in a month earlier than the first goal', () => {
    expect(activeInMonth([older, newer], '2026-04')).toBeNull();
  });

  it('is absent between a closed goal and the next one', () => {
    const closed = row({ id: 'closed', startMonth: '2026-05', endMonth: '2026-06' });
    const later = row({ id: 'later', startMonth: '2026-09' });

    expect(activeInMonth([closed, later], '2026-07')).toBeNull();
  });

  it('still shows a goal in the month it is due, and not in the next one', () => {
    const due = row({ kind: 'BY_DATE', startMonth: '2026-05', dueMonth: '2026-08' });

    expect(activeInMonth([due], '2026-08')?.id).toBe(due.id);
    expect(activeInMonth([due], '2026-09')).toBeNull();
  });

  it('still shows a goal in the month it was closed, and not in the next one', () => {
    const closed = row({ startMonth: '2026-05', endMonth: '2026-08' });

    expect(activeInMonth([closed], '2026-08')?.id).toBe(closed.id);
    expect(activeInMonth([closed], '2026-09')).toBeNull();
  });
});

describe('the goal a write works on', () => {
  it('is not the one closed this month, which the read still shows', () => {
    const closed = row({ startMonth: '2026-05', endMonth: '2026-08' });

    expect(activeInMonth([closed], '2026-08')?.id).toBe(closed.id);
    expect(liveTarget([closed], '2026-08')).toBeNull();
  });
});

describe('the branch a write takes', () => {
  it('creates when the category has no goal at all', () => {
    expect(targetWrite([], '2026-08', 'CONTRIBUTE')).toEqual({ act: 'create' });
  });

  it('overwrites the row of this month when it is there but not live', () => {
    const closed = row({ id: 'closed', startMonth: '2026-08', endMonth: '2026-08' });

    expect(targetWrite([closed], '2026-08', 'BY_DATE')).toEqual({
      act: 'overwrite',
      id: 'closed',
    });
  });

  it('edits a live goal started this month, whatever kind is asked for', () => {
    const fresh = row({ id: 'fresh', startMonth: '2026-08' });

    expect(targetWrite([fresh], '2026-08', 'BY_DATE')).toEqual({ act: 'edit', id: 'fresh' });
    expect(targetWrite([fresh], '2026-08', 'CONTRIBUTE')).toEqual({ act: 'edit', id: 'fresh' });
  });

  it('edits a live goal started earlier when the kind stays the same', () => {
    const running = row({ id: 'running', startMonth: '2026-05', kind: 'CONTRIBUTE' });

    expect(targetWrite([running], '2026-08', 'CONTRIBUTE')).toEqual({
      act: 'edit',
      id: 'running',
    });
  });

  it('closes a live goal started earlier and starts a new one when the kind changes', () => {
    const running = row({ id: 'running', startMonth: '2026-05', kind: 'CONTRIBUTE' });

    expect(targetWrite([running], '2026-08', 'BY_DATE')).toEqual({
      act: 'closeAndCreate',
      id: 'running',
    });
  });
});
