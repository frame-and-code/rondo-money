import { heldAccount, refusalOfAccounts, type OpenAccountRow } from '@/accounts/open-accounts';

const WALLET = '0199c1a8-9ecf-71c7-a617-c575df073912';
const CARD = '0199c1a8-9ecf-71c7-a617-c575df073913';

const OPENED = new Date('2026-08-01T00:00:00Z');
const CLOSED = new Date('2026-08-20T00:00:00Z');

const open = (id: string): OpenAccountRow => ({ id, createdAt: OPENED, archivedAt: null });

const archived = (id: string): OpenAccountRow => ({ id, createdAt: OPENED, archivedAt: CLOSED });

describe('the rule that says which accounts a write may touch', () => {
  it('refuses an account the budget does not hold at all', () => {
    expect(refusalOfAccounts([WALLET, CARD], [open(WALLET)])).toBe('UNKNOWN_ACCOUNT');
  });

  it('refuses an archived account, because it takes no write of any kind', () => {
    expect(refusalOfAccounts([WALLET], [archived(WALLET)])).toBe('ACCOUNT_ARCHIVED');
  });

  it('refuses a pair when either side is archived, whichever side asked', () => {
    expect(refusalOfAccounts([WALLET, CARD], [open(WALLET), archived(CARD)])).toBe(
      'ACCOUNT_ARCHIVED',
    );
    expect(refusalOfAccounts([CARD, WALLET], [archived(CARD), open(WALLET)])).toBe(
      'ACCOUNT_ARCHIVED',
    );
  });

  it('lets a write through when every account it names is open', () => {
    expect(refusalOfAccounts([WALLET, CARD], [open(WALLET), open(CARD)])).toBeNull();
  });

  it('names the missing account before the archived one, so a wrong id reads as a wrong id', () => {
    expect(refusalOfAccounts([WALLET, CARD], [archived(CARD)])).toBe('UNKNOWN_ACCOUNT');
  });
});

describe('reading back a row the write already holds', () => {
  it('answers with the row it took', () => {
    const held = new Map([[WALLET, open(WALLET)]]);

    expect(heldAccount(held, WALLET)).toEqual(open(WALLET));
  });

  it('refuses an account the write never took, rather than judging it by nothing', () => {
    const held = new Map([[WALLET, open(WALLET)]]);

    expect(() => heldAccount(held, CARD)).toThrow(CARD);
  });
});
