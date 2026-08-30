import { type CalendarMonth, type TargetKind } from '@rondo/types';

export interface TargetRow {
  id: string;
  kind: TargetKind;
  startMonth: CalendarMonth;
  dueMonth: CalendarMonth | null;
  endMonth: CalendarMonth | null;
}

export type TargetWrite =
  | { act: 'create' }
  | { act: 'overwrite'; id: string }
  | { act: 'edit'; id: string }
  | { act: 'closeAndCreate'; id: string };

function lastStarted<Row extends TargetRow>(rows: readonly Row[]): Row | null {
  return rows.reduce<Row | null>(
    (best, row) => (best === null || best.startMonth < row.startMonth ? row : best),
    null,
  );
}

export function activeInMonth<Row extends TargetRow>(
  rows: readonly Row[],
  month: CalendarMonth,
): Row | null {
  return lastStarted(
    rows.filter(
      (row) =>
        row.startMonth <= month &&
        (row.endMonth === null || month <= row.endMonth) &&
        (row.dueMonth === null || month <= row.dueMonth),
    ),
  );
}

export function liveTarget<Row extends TargetRow>(
  rows: readonly Row[],
  month: CalendarMonth,
): Row | null {
  return lastStarted(
    rows.filter(
      (row) =>
        row.startMonth <= month &&
        row.endMonth === null &&
        (row.dueMonth === null || month <= row.dueMonth),
    ),
  );
}

export function targetWrite(
  rows: readonly TargetRow[],
  month: CalendarMonth,
  kind: TargetKind,
): TargetWrite {
  const live = liveTarget(rows, month);
  if (live !== null) {
    return live.startMonth === month || live.kind === kind
      ? { act: 'edit', id: live.id }
      : { act: 'closeAndCreate', id: live.id };
  }

  const started = rows.find((row) => row.startMonth === month);

  return started ? { act: 'overwrite', id: started.id } : { act: 'create' };
}
