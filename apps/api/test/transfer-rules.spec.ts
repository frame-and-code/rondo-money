import { type BudgetClock } from '@/transactions/entry-rules';
import {
  inLegWriteOrder,
  refuseTransfer,
  type TransferAccount,
  type TransferDraft,
} from '@/transfers/transfer-rules';

const ZONE = 'Europe/Warsaw';

const CLOCK: BudgetClock = { timezone: ZONE, today: '2026-08-31' };

const OPENED_EARLY = new Date('2026-06-01T09:00:00Z');

const OPENED_LATE = new Date('2026-08-10T09:00:00Z');

const wallet: TransferAccount = { id: 'a1', createdAt: OPENED_EARLY, archivedAt: null };

const card: TransferAccount = { id: 'a2', createdAt: OPENED_LATE, archivedAt: null };

const draft = (over: Partial<TransferDraft> = {}): TransferDraft => ({
  from: wallet,
  to: card,
  date: '2026-08-31',
  ...over,
});

describe('the two sides a transfer names', () => {
  it('takes two accounts of the budget', () => {
    expect(refuseTransfer(draft(), CLOCK)).toBeNull();
  });

  it('refuses one account named twice, because the money would arrive where it left from', () => {
    expect(refuseTransfer(draft({ to: { ...wallet } }), CLOCK)).toBe('SAME_ACCOUNT');
  });

  it('refuses an archived source, whichever side it is on', () => {
    const closed = { ...wallet, archivedAt: new Date('2026-08-20T00:00:00Z') };

    expect(refuseTransfer(draft({ from: closed }), CLOCK)).toBe('ACCOUNT_ARCHIVED');
  });

  it('refuses an archived target, because a closed account takes no money either', () => {
    const closed = { ...card, archivedAt: new Date('2026-08-20T00:00:00Z') };

    expect(refuseTransfer(draft({ to: closed }), CLOCK)).toBe('ACCOUNT_ARCHIVED');
  });
});

describe('the day a transfer may carry', () => {
  it('takes today in the budget timezone', () => {
    expect(refuseTransfer(draft({ date: '2026-08-31' }), CLOCK)).toBeNull();
  });

  it('refuses tomorrow, because money is recorded after it moves', () => {
    expect(refuseTransfer(draft({ date: '2026-09-01' }), CLOCK)).toBe('DATE_IN_FUTURE');
  });

  it('takes the day the later of the two accounts was opened', () => {
    expect(refuseTransfer(draft({ date: '2026-08-10' }), CLOCK)).toBeNull();
  });

  it('refuses a day between the two openings, since one of the accounts did not exist yet', () => {
    expect(refuseTransfer(draft({ date: '2026-07-01' }), CLOCK)).toBe('DATE_BEFORE_ACCOUNT');
  });

  it('refuses a day before either account was opened', () => {
    expect(refuseTransfer(draft({ date: '2026-05-31' }), CLOCK)).toBe('DATE_BEFORE_ACCOUNT');
  });

  it('reads the opening day in the budget timezone rather than in UTC', () => {
    const lateEvening = { ...card, createdAt: new Date('2026-08-09T23:30:00Z') };

    expect(refuseTransfer(draft({ to: lateEvening, date: '2026-08-10' }), CLOCK)).toBeNull();
    expect(refuseTransfer(draft({ to: lateEvening, date: '2026-08-09' }), CLOCK)).toBe(
      'DATE_BEFORE_ACCOUNT',
    );
  });
});

describe('the order a transfer writes its two legs in', () => {
  const legs = [
    { id: '0199c1a8-9ecf-71c7-a617-c575df073712' },
    { id: '0199c1a8-9ecf-71c7-a617-c575df073710' },
  ];

  it('writes them by row id rather than by side, so two opposite edits cannot deadlock', () => {
    const forward = inLegWriteOrder(legs);
    const backward = inLegWriteOrder([...legs].reverse());

    expect(forward.map((leg) => leg.id)).toEqual([
      '0199c1a8-9ecf-71c7-a617-c575df073710',
      '0199c1a8-9ecf-71c7-a617-c575df073712',
    ]);
    expect(backward.map((leg) => leg.id)).toEqual(forward.map((leg) => leg.id));
  });

  it('keeps every leg it was given', () => {
    expect(inLegWriteOrder(legs)).toHaveLength(2);
  });
});
