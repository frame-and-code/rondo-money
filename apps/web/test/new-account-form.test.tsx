import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewAccountForm } from '@/components/new-account-form';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import type { Locale } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { ru } from '@/i18n/messages/ru';

const submit = jest.fn();
const replace = jest.fn();

let budget: { id: string; currency: string; minorDigits: number; active: boolean } | null = null;
let budgetFails = false;
let budgetGate: Promise<void> | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replace(href) as unknown }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  accountsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => submit(options) as unknown,
  }),
  accountsControllerListQueryKey: () => ['accountsControllerList'],
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: async () => {
      if (budgetGate !== null) await budgetGate;
      if (budgetFails) throw new Error('the api was unreachable');

      return budget === null ? [] : [budget];
    },
  }),
}));

const bodyOf = (call: number): Record<string, unknown> => {
  const options = submit.mock.calls[call]?.[0];
  if (typeof options !== 'object' || options === null || !('body' in options)) {
    throw new Error(`Call ${call} carried no body: ${JSON.stringify(options)}`);
  }

  const { body } = options;
  if (typeof body !== 'object' || body === null) {
    throw new Error(`Call ${call} carried a body that is not an object`);
  }

  return { ...body };
};

let client: QueryClient;

const draw = (locale: Locale = 'ru', shared?: QueryClient) => {
  // The provider takes the browser's languages over its own initial value, so the language
  // under test is set where the browser reports it.
  Object.defineProperty(window.navigator, 'languages', {
    value: [locale === 'en' ? 'en-US' : 'ru-RU'],
    configurable: true,
  });
  client = shared ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale}>
        <NewAccountForm nameIndex={0} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const t = (locale: Locale) => (locale === 'en' ? en : ru);

const amountField = async (locale: Locale = 'ru') =>
  screen.findByLabelText(t(locale)['newAccount.balanceLabel']);

const fillOut = async (
  user: ReturnType<typeof userEvent.setup>,
  { name = 'Кошелёк', amount = '' }: { name?: string; amount?: string } = {},
) => {
  await user.type(await screen.findByLabelText(ru['newAccount.nameLabel']), name);
  await user.click(screen.getByRole('button', { name: new RegExp(ru['newAccount.typeCash']) }));
  if (amount !== '') {
    await user.type(await amountField(), amount);
  }
};

const send = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: ru['newAccount.submit'] }));
};

describe('the first account form', () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ id: 'acc-1', name: 'Кошелёк', type: 'CASH' });
    replace.mockReset();
    budget = { id: 'b-1', currency: 'PLN', minorDigits: 2, active: true };
    budgetFails = false;
    budgetGate = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends zero when the amount is left empty', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user);
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['initialBalance']).toBe('0');
  });

  it('sends the amount as minor units of the budget currency', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user, { amount: '1250,50' });
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      name: 'Кошелёк',
      type: 'CASH',
      initialBalance: '125050',
    });
  });

  it('reads a grouping separator as grouping, not as a decimal mark', async () => {
    // A comma groups thousands in English and marks the decimal in Russian. Rewriting it to a
    // dot either way turns 1,250 into one and a quarter on a currency with three minor digits.
    budget = { id: 'b-1', currency: 'KWD', minorDigits: 3, active: true };
    const user = userEvent.setup();
    draw('en');

    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Main card');
    await user.type(screen.getByLabelText(en['newAccount.balanceLabel']), '1,250');
    await user.click(screen.getByRole('button', { name: en['newAccount.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['initialBalance']).toBe('1250000');
  });

  it('takes a grouped amount in a locale that groups with a space', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user, { amount: '1 250,50' });
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['initialBalance']).toBe('125050');
  });

  it('mints a new key once the intent changes after a failure', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new Error('the network was unkind'));
    draw();

    await fillOut(user);
    await send(user);
    expect(await screen.findByText(ru['newAccount.submitFailed'])).toBeInTheDocument();

    await user.type(screen.getByLabelText(ru['newAccount.nameLabel']), ' на чёрный день');
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
  });

  it('refuses a negative amount and sends nothing', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user, { amount: '-40' });

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.balanceNegative']);
    expect(screen.getByRole('button', { name: ru['newAccount.submit'] })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('takes the decimal places from the budget, so a zero-digit currency refuses a fraction', async () => {
    budget = { id: 'b-1', currency: 'JPY', minorDigits: 0, active: true };
    const user = userEvent.setup();
    draw();

    await fillOut(user, { amount: '12.5' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      interpolate(ru['newAccount.balanceNoDecimals'], { currency: 'JPY' }),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('takes the symbol and the side it sits on from the locale, not from a fixed side', async () => {
    budget = { id: 'b-1', currency: 'USD', minorDigits: 2, active: true };

    const inEnglish = draw('en');
    const english = await screen.findByLabelText(en['newAccount.balanceLabel']);
    const before = await screen.findByText('$');
    expect(before.compareDocumentPosition(english) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    inEnglish.unmount();

    draw('ru');
    const russian = await screen.findByLabelText(ru['newAccount.balanceLabel']);
    const after = await screen.findByText('$');
    expect(after.compareDocumentPosition(russian) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('refuses a repeated decimal mark instead of reading the first two parts', async () => {
    const user = userEvent.setup();
    draw();

    await user.type(await screen.findByLabelText(ru['newAccount.balanceLabel']), '1,25,50');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.balanceDigitsOnly']);
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses a fraction that is not digits, rather than throwing inside the render', async () => {
    const user = userEvent.setup();
    draw();

    await user.type(await screen.findByLabelText(ru['newAccount.balanceLabel']), '1,a');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.balanceDigitsOnly']);
  });

  it('refuses a long grouped amount without taking the regular expression apart', async () => {
    // The separator this locale groups with is also whitespace. Written as an alternation both
    // branches match it, and an input this long that fails the pattern backtracks for minutes.
    const user = userEvent.setup();
    draw();

    const long = `1${'\u00a0250'.repeat(40)}x`;
    await user.click(await screen.findByLabelText(ru['newAccount.balanceLabel']));
    await user.paste(long);

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.balanceDigitsOnly']);
  }, 5_000);

  it('reads a leading decimal mark as an amount under one unit', async () => {
    const user = userEvent.setup();
    draw();

    await user.type(await screen.findByLabelText(ru['newAccount.balanceLabel']), ',50');
    await user.type(screen.getByLabelText(ru['newAccount.nameLabel']), 'Кошелёк');
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['initialBalance']).toBe('50');
  });

  it('previews at the budget scale even where the browser disagrees about the currency', async () => {
    // The digit count is frozen on the budget row; the browser's own currency table is a second
    // source, and the two part company on a runtime upgrade.
    budget = { id: 'b-1', currency: 'JPY', minorDigits: 2, active: true };
    const user = userEvent.setup();
    draw();

    await user.type(await screen.findByLabelText(ru['newAccount.balanceLabel']), '12,50');

    expect(await screen.findByText(/12,50/)).toBeInTheDocument();
  });

  it('shows the symbol of a currency that has one, and the code of a currency that does not', async () => {
    budget = { id: 'b-1', currency: 'PLN', minorDigits: 2, active: true };
    const withSymbol = draw();
    expect(await screen.findByText('zł')).toBeVisible();
    withSymbol.unmount();

    budget = { id: 'b-1', currency: 'DZD', minorDigits: 2, active: true };
    draw();
    expect(await screen.findByText('DZD')).toBeVisible();
  });

  it('keeps the submit off until the account is named', async () => {
    const user = userEvent.setup();
    draw();

    const button = await screen.findByRole('button', { name: ru['newAccount.submit'] });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(ru['newAccount.nameLabel']), 'Основная карта');
    expect(button).toBeEnabled();
  });

  it('offers the debit card first and starts on it, with cash one tap away', async () => {
    draw();

    const debit = await screen.findByRole('button', {
      name: new RegExp(ru['newAccount.typeDebit']),
    });
    const cash = screen.getByRole('button', { name: new RegExp(ru['newAccount.typeCash']) });

    expect(debit).toHaveAttribute('aria-pressed', 'true');
    expect(cash).toHaveAttribute('aria-pressed', 'false');
    expect(debit.compareDocumentPosition(cash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends the kind the user picked instead of the one it started on', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user);
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['type']).toBe('CASH');
  });

  it('shows the name example it was handed, rather than one fixed word', async () => {
    draw();

    expect(await screen.findByPlaceholderText(ru['newAccount.namePlaceholder.0'])).toBeVisible();
  });

  it('shows one line under the amount at a time', async () => {
    const user = userEvent.setup();
    draw();

    expect(await screen.findByText(ru['newAccount.balanceHint'])).toBeInTheDocument();

    await user.type(await amountField(), '1250,50');
    await waitFor(() => {
      expect(screen.queryByText(ru['newAccount.balanceHint'])).not.toBeInTheDocument();
    });
    expect(screen.getByText(/1\s?250,50/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(await amountField());
    await user.type(await amountField(), '-1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(ru['newAccount.balanceHint'])).not.toBeInTheDocument();
  });

  it('keeps one idempotency key across a double click', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new Error('the network was unkind'));
    draw();

    await fillOut(user);
    await send(user);
    expect(await screen.findByText(ru['newAccount.submitFailed'])).toBeInTheDocument();

    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)['idempotencyKey']).toBe(bodyOf(0)['idempotencyKey']);
  });

  it('trims the edges off the name', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user, { name: '  Кошелёк  ' });
    await send(user);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)['name']).toBe('Кошелёк');
  });

  it('says the account exists before it moves on', async () => {
    const user = userEvent.setup();
    draw();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    await fillOut(user, { amount: '1000' });
    await send(user);

    expect(
      await screen.findByText(interpolate(ru['newAccount.doneTitle'], { name: 'Кошелёк' })),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(ru['newAccount.nameLabel'])).not.toBeInTheDocument();
    expect(screen.queryByText(ru['newAccount.cardDescription'])).not.toBeInTheDocument();
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['accountsControllerList'] }),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('opens the budget on Categories once that confirmation has been read', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    draw();

    await fillOut(user, { amount: '1000' });
    await send(user);
    await screen.findByText(interpolate(ru['newAccount.doneTitle'], { name: 'Кошелёк' }));

    expect(replace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(replace).toHaveBeenCalledWith('/categories');
  });

  it('does not read a failed budget request as an absent budget', async () => {
    // Only an answer says there is no budget. Bouncing on a failure sends someone who has one
    // to the screen that would create them a second, which deactivates the first.
    budgetFails = true;
    draw();

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.budgetUnavailable']);
    expect(replace).not.toHaveBeenCalled();
  });

  it('freezes the fields while the request is in flight, so the body cannot outrun its key', async () => {
    const user = userEvent.setup();
    let settle: () => void = () => {};
    submit.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = () => {
            resolve({ id: 'acc-1', name: 'Кошелёк', type: 'CASH' });
          };
        }),
    );
    draw();

    await fillOut(user);
    await send(user);

    await waitFor(() => {
      expect(screen.getByLabelText(ru['newAccount.nameLabel'])).toBeDisabled();
    });
    expect(screen.getByLabelText(ru['newAccount.balanceLabel'])).toBeDisabled();
    expect(
      screen.getByRole('button', { name: new RegExp(ru['newAccount.typeDebit']) }),
    ).toBeDisabled();

    settle();
    await screen.findByText(interpolate(ru['newAccount.doneTitle'], { name: 'Кошелёк' }));
  });

  it('writes the placeholder with the decimal mark the locale uses', async () => {
    const russian = draw();
    expect(await screen.findByPlaceholderText('0,00')).toBeVisible();
    russian.unmount();

    draw('en');
    expect(await screen.findByPlaceholderText('0.00')).toBeVisible();
  });

  it('waits for its own answer before deciding there is no budget', async () => {
    // A cached empty list can be older than the budget it is being asked about: the user was
    // bounced to step 1, made one there, and came back. Redirecting on it sends them to the
    // screen that would create a second budget, which deactivates the first.
    const shared = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    shared.setQueryData(['budgetsControllerList'], []);
    await shared.invalidateQueries({ queryKey: ['budgetsControllerList'] });

    let answer: () => void = () => {};
    budgetGate = new Promise<void>((resolve) => {
      answer = resolve;
    });

    draw('ru', shared);
    expect(replace).not.toHaveBeenCalled();

    answer();
    expect(await screen.findByLabelText(ru['newAccount.nameLabel'])).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('refuses a separator where grouping could not have put it', async () => {
    // "1250,50" is a comma used as a decimal mark in a locale that groups with one. Dropping it
    // would send a hundred times the amount, and nothing downstream could tell.
    budget = { id: 'b-1', currency: 'USD', minorDigits: 2, active: true };
    const user = userEvent.setup();
    draw('en');

    await user.type(await screen.findByLabelText(en['newAccount.nameLabel']), 'Main card');
    await user.type(screen.getByLabelText(en['newAccount.balanceLabel']), '1250,50');

    expect(await screen.findByRole('alert')).toHaveTextContent(en['newAccount.balanceDigitsOnly']);
    expect(screen.getByRole('button', { name: en['newAccount.submit'] })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends a visitor who has no budget back to the first step', async () => {
    budget = null;
    draw();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(screen.queryByLabelText(ru['newAccount.nameLabel'])).not.toBeInTheDocument();
    expect(screen.queryByText(ru['newAccount.cardDescription'])).not.toBeInTheDocument();
  });

  it('reports a failure instead of pretending the account exists', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new Error('the network was unkind'));
    draw();

    await fillOut(user);
    await send(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newAccount.submitFailed']);
    expect(replace).not.toHaveBeenCalled();
  });
});
