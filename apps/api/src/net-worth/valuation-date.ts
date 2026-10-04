import { type CalendarDate } from '@rondo/types';

import { type BudgetClock } from '@/transactions/entry-rules';

export function refuseValuation(
  date: CalendarDate | null,
  clock: BudgetClock,
): 'DATE_IN_FUTURE' | null {
  return date !== null && date > clock.today ? 'DATE_IN_FUTURE' : null;
}
