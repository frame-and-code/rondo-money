/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { TransactionDay } from '@/components/transaction-day';
import { LocaleProvider } from '@/i18n/locale-context';
import { moneyOf } from '@/lib/money';
import { type FeedDay } from '@/lib/transaction-feed';

const money = moneyOf('en-US', 'PLN', 2);

const day: FeedDay = {
  date: '2026-08-31',
  name: null,
  total: '-4000',
  records: [
    {
      id: 'r1',
      accountId: 'a1',
      categoryId: 'c1',
      date: '2026-08-31',
      amount: '-4000',
      type: 'EXPENSE',
      payee: 'Corner cafe',
      isSystem: false,
      transferId: null,
      counterAccountId: null,
      createdAt: '2026-08-31T09:00:00.000Z',
    },
  ],
};

describe('the heading over one day of the feed', () => {
  it('names the day the records carry, whatever zone the reader sits in', () => {
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDay
          day={day}
          money={money}
          timeZone="Europe/Warsaw"
          accountName={() => 'Wallet'}
          categoryOf={() => ({ name: 'Coffee', icon: null, color: null })}
          showAccount={false}
          onOpen={jest.fn()}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('31 August');
    expect(screen.getByTestId('day-total-2026-08-31')).toHaveTextContent('-40');
  });

  it('ends the day total in the same column the row amounts end in', () => {
    render(
      <LocaleProvider initialLocale="en">
        <TransactionDay
          day={day}
          money={money}
          timeZone="Europe/Warsaw"
          accountName={() => 'Wallet'}
          categoryOf={() => ({ name: 'Coffee', icon: null, color: null })}
          showAccount={false}
          onOpen={jest.fn()}
        />
      </LocaleProvider>,
    );

    const heading = screen.getByTestId('day-total-2026-08-31').parentElement;
    const row = screen.getByTestId('amount-r1').parentElement;

    expect(heading?.lastElementChild).toBe(screen.getByTestId('day-total-2026-08-31'));
    expect(row?.lastElementChild).toBe(screen.getByTestId('amount-r1'));
    expect(heading?.className).toContain('px-4');
    expect(row?.className).toContain('px-4');
  });
});
