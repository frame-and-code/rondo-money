import { supportedCurrencyCodes } from '@rondo/types';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';

import { NewBudgetForm } from '@/components/new-budget-form';
import { AdmittedStateContext } from '@/components/onboarding-gate';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import { localeLabels } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';
import { ru } from '@/i18n/messages/ru';

const submit = jest.fn();
const replace = jest.fn();

interface ListedBudget {
  id: string;
  name: string;
  currency: string;
  minorDigits: number;
  timezone: string;
  firstMonth: string;
  createdOn: string;
  active: boolean;
}

let budgets: ListedBudget[] = [];
let listGate: Promise<void> | null = null;

const addressListeners = new Set<() => void>();
const nativeReplaceState = window.history.replaceState.bind(window.history);
const replaceState = jest.fn((data: unknown, unused: string, url?: string | URL | null) => {
  nativeReplaceState(data, unused, url);
  addressListeners.forEach((notify) => notify());
});

const openAt = (address: string): void => {
  nativeReplaceState(null, '', address);
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replace(href) as unknown }),
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(
        (notify: () => void) => {
          addressListeners.add(notify);

          return () => {
            addressListeners.delete(notify);
          };
        },
        () => window.location.search,
      ),
    ),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => submit(options) as unknown,
  }),
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: async () => {
      if (listGate !== null) await listGate;

      return budgets.map((each) => ({ ...each }));
    },
  }),
  budgetsControllerListQueryKey: () => ['budgetsControllerList'],
  accountsControllerListQueryKey: () => ['accountsControllerList'],
  userSettingsControllerReadQueryKey: () => ['userSettingsControllerRead'],
}));

beforeAll(() => {
  window.history.replaceState = replaceState;
});

afterAll(() => {
  window.history.replaceState = nativeReplaceState;
});

afterEach(() => {
  openAt('/new');
  replaceState.mockClear();
  budgets = [];
  listGate = null;
});

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const FADE_OVER_MS = 5_000;

const currencyName = (locale: string, code: string): string =>
  new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;

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

const view = (nameIndex: number) => (
  <QueryClientProvider client={new QueryClient()}>
    <LocaleProvider initialLocale="ru">
      <NewBudgetForm nameIndex={nameIndex} />
    </LocaleProvider>
  </QueryClientProvider>
);

const draw = (nameIndex = 0) => render(view(nameIndex));

const openCurrencies = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string = ru['newBudget.currencyLabel'],
) => {
  await user.click(screen.getByRole('combobox', { name: label }));
};

const searchBox = (placeholder: string = ru['newBudget.searchPlaceholder']) =>
  screen.findByPlaceholderText(placeholder);

const pickCurrency = async (
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  option: RegExp,
) => {
  await openCurrencies(user);
  await user.type(await searchBox(), query);
  await user.click(await screen.findByRole('option', { name: option }));
};

const formOf = (): HTMLElement => {
  const form = screen.getByRole('button', { name: ru['newBudget.submit'] }).closest('form');
  if (form === null) {
    throw new Error('The submit button is not inside a form');
  }

  return form;
};

const comesAfterTheForm = (element: HTMLElement): boolean =>
  Boolean(formOf().compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);

const fillOut = async (user: ReturnType<typeof userEvent.setup>, name = 'Семейный') => {
  await user.type(screen.getByLabelText(ru['newBudget.nameLabel']), name);
  await pickCurrency(user, 'PLN', /PLN/);
};

describe('the new budget form', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-1' });
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  it('explains what the budget is for before asking for anything', () => {
    draw();

    expect(screen.getByRole('heading', { name: ru['newBudget.heading'] })).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.lead'])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step1Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step2Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step3Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.cardTitle'])).toBeInTheDocument();
  });

  it('puts the explainer beside the form, where the wide layout has room for it', () => {
    draw();

    expect(comesAfterTheForm(screen.getByText(ru['onboarding.step1Title']))).toBe(false);
  });

  it('offers the theme switch, which is the only control outside the form', () => {
    draw();

    expect(
      screen.getByRole('button', { name: ru['common.themeToggle.trigger'] }),
    ).toBeInTheDocument();
  });

  it('takes the placeholder from the dictionary by the index the server picked', () => {
    const { rerender } = draw(2);

    expect(screen.getByLabelText(ru['newBudget.nameLabel'])).toHaveAttribute(
      'placeholder',
      ru['newBudget.namePlaceholder.2'],
    );

    rerender(view(2));

    expect(screen.getByLabelText(ru['newBudget.nameLabel'])).toHaveAttribute(
      'placeholder',
      ru['newBudget.namePlaceholder.2'],
    );
  });

  it('shows the chosen language on the field and marks it in the list', async () => {
    const user = userEvent.setup();
    draw();

    const field = screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] });
    expect(field).toHaveTextContent(localeLabels.ru);

    await user.click(field);

    expect(await screen.findByRole('option', { name: localeLabels.en })).toBeInTheDocument();
  });

  it('filters the currency list by code and by name', async () => {
    const user = userEvent.setup();
    draw();

    await openCurrencies(user);
    const search = await searchBox();

    await user.type(search, 'PLN');
    expect(await screen.findByRole('option', { name: /PLN/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /JPY/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, currencyName('ru', 'JPY'));
    expect(await screen.findByRole('option', { name: /JPY/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PLN/ })).not.toBeInTheDocument();
  });

  it('puts a matching code first, so typing it does not bury it under names', async () => {
    const user = userEvent.setup();
    draw();

    await openCurrencies(user);
    await user.type(await searchBox(), 'PL');

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('PLN');
  });

  it('says how much of the list is on screen, so a missing code reads as keep typing', async () => {
    const user = userEvent.setup();
    const total = supportedCurrencyCodes().length;
    draw();

    await openCurrencies(user);

    expect(
      await screen.findByText(
        interpolate(ru['newBudget.currencyCountLimited'], { limit: 60, total }),
      ),
    ).toBeInTheDocument();
    expect(await screen.findAllByRole('option')).toHaveLength(60);

    await user.type(await searchBox(), 'PLN');

    expect(
      await screen.findByText(interpolate(ru['newBudget.currencyCount'], { shown: 1, total })),
    ).toBeInTheDocument();
  });

  it('says nothing was found rather than showing an empty list', async () => {
    const user = userEvent.setup();
    draw();

    await openCurrencies(user);
    await user.type(await searchBox(), 'qqqqq');

    expect(await screen.findByText(ru['newBudget.nothingFound'])).toBeInTheDocument();
  });

  it('warns that the currency is permanent, and shows no sample amount once one is picked', async () => {
    const user = userEvent.setup();
    draw();

    expect(screen.getByText(ru['newBudget.currencyLocked'])).toBeInTheDocument();

    await pickCurrency(user, 'PLN', /PLN/);

    const sample = new Intl.NumberFormat('ru', { style: 'currency', currency: 'PLN' }).format(
      1234.5,
    );
    const shown = new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'));
    expect(screen.queryByText(shown)).not.toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.currencyLocked'])).toBeInTheDocument();
  });

  it('switches every label and the currency names when the language changes', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));
    await user.click(await screen.findByRole('option', { name: localeLabels.en }));

    expect(await screen.findByText(en['newBudget.heading'])).toBeInTheDocument();
    expect(screen.getByText(en['newBudget.cardTitle'])).toBeInTheDocument();

    await openCurrencies(user, en['newBudget.currencyLabel']);
    await user.type(await searchBox(en['newBudget.searchPlaceholder']), 'PLN');

    const option = await screen.findByRole('option', { name: /PLN/ });
    expect(within(option).getByText(currencyName('en', 'PLN'))).toBeInTheDocument();
  });

  it('keeps submit closed until there is a name and a currency', async () => {
    const user = userEvent.setup();
    draw();

    const button = screen.getByRole('button', { name: ru['newBudget.submit'] });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(ru['newBudget.nameLabel']), 'Семейный');
    expect(button).toBeDisabled();

    await pickCurrency(user, 'PLN', /PLN/);
    expect(button).toBeEnabled();

    await user.clear(screen.getByLabelText(ru['newBudget.nameLabel']));
    expect(button).toBeDisabled();
  });

  it('sends what the user chose, the browser timezone included', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user, '  Семейный  ');
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      language: 'ru',
      name: 'Семейный',
      currency: 'PLN',
      timezone: TIMEZONE,
      withDefaultCategories: true,
    });
  });

  it('lets the starter categories be declined, and says what that means', async () => {
    const user = userEvent.setup();
    draw();

    expect(screen.getByText(ru['newBudget.defaultsOn'])).toBeInTheDocument();

    await fillOut(user);
    await user.click(screen.getByRole('checkbox', { name: /./ }));

    expect(screen.getByText(ru['newBudget.defaultsOff'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru['newBudget.submit'] })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ withDefaultCategories: false });
  });

  it('carries the language the user picked into the request', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    await user.type(await screen.findByLabelText(pl['newBudget.nameLabel']), 'Domowy');
    await openCurrencies(user, pl['newBudget.currencyLabel']);
    await user.type(await searchBox(pl['newBudget.searchPlaceholder']), 'PLN');
    await user.click(await screen.findByRole('option', { name: /PLN/ }));

    await user.click(screen.getByRole('button', { name: pl['newBudget.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ language: 'pl' });
  });

  describe('the idempotency key', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps the key and the language in step, even mid-fade after a failed submit', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      submit.mockRejectedValue(new Error('the network was unkind'));
      draw();

      await fillOut(user);
      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
      expect(await screen.findByText(ru['newBudget.submitFailed'])).toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));
      await user.click(await screen.findByRole('option', { name: localeLabels.en }));

      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(bodyOf(1)).toMatchObject({
        language: 'ru',
        idempotencyKey: bodyOf(0)['idempotencyKey'],
      });

      await act(async () => {
        jest.advanceTimersByTime(FADE_OVER_MS);
      });

      await user.click(await screen.findByRole('button', { name: en['newBudget.submit'] }));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(3));
      expect(bodyOf(2)).toMatchObject({ language: 'en' });
      expect(bodyOf(2)['idempotencyKey']).not.toBe(bodyOf(1)['idempotencyKey']);
    });

    it('swallows a second click instead of sending it with a fresh key', async () => {
      const user = userEvent.setup();
      submit.mockReturnValue(new Promise(() => {}));
      draw();

      await fillOut(user);

      const button = screen.getByRole('button', { name: ru['newBudget.submit'] });
      await user.click(button);
      await user.click(button);

      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
      expect(bodyOf(0)['idempotencyKey']).toBeTruthy();
    });

    it('is minted again once a field changes after a failed submit', async () => {
      const user = userEvent.setup();
      submit.mockRejectedValue(new Error('the network was unkind'));
      draw();

      await fillOut(user);
      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
      expect(await screen.findByText(ru['newBudget.submitFailed'])).toBeInTheDocument();

      await user.click(screen.getByRole('checkbox', { name: /./ }));
      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
    });

    it('is minted again once the language changes after a failed submit', async () => {
      const user = userEvent.setup();
      submit.mockRejectedValue(new Error('the network was unkind'));
      draw();

      await fillOut(user);
      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
      expect(await screen.findByText(ru['newBudget.submitFailed'])).toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));
      await user.click(await screen.findByRole('option', { name: localeLabels.en }));
      await user.click(await screen.findByRole('button', { name: en['newBudget.submit'] }));

      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
    });

    it('keeps the key while the same intent is retried unchanged', async () => {
      const user = userEvent.setup();
      submit.mockRejectedValue(new Error('the network was unkind'));
      draw();

      await fillOut(user);
      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
      expect(await screen.findByText(ru['newBudget.submitFailed'])).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(bodyOf(1)['idempotencyKey']).toBe(bodyOf(0)['idempotencyKey']);
    });
  });

  it('names the budget it created, and the currency it is now stuck with', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    expect(
      await screen.findByText(interpolate(ru['newBudget.doneTitle'], { name: 'Семейный' })),
    ).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.doneWithDefaults'])).toBeInTheDocument();
    expect(screen.getByText('Польский злотый')).toBeInTheDocument();
    expect(screen.queryByText('PLN')).not.toBeInTheDocument();
    expect(screen.queryByText(ru['newBudget.cardTitle'])).not.toBeInTheDocument();
  });

  it('offers the way on to the accounts step, and goes nowhere on its own', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    const onwards = await screen.findByRole('link', { name: ru['newBudget.continue'] });
    expect(onwards).toHaveAttribute('href', '/new/account');
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders that way on as a real anchor, with no complaint from the primitive', async () => {
    const user = userEvent.setup();
    const complaints = jest.spyOn(console, 'error').mockImplementation(() => {});
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
    await screen.findByRole('link', { name: ru['newBudget.continue'] });

    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
  });

  it('confirms the budget that was sent, not what the form was changed to while it was on its way', async () => {
    const user = userEvent.setup();
    let answer: (value: { id: string }) => void = () => {};
    submit.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        answer = resolve;
      }),
    );
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(ru['newBudget.nameLabel']), ' и ещё');
    await pickCurrency(user, 'USD', /USD/);
    await act(async () => {
      answer({ id: 'budget-1' });
      await Promise.resolve();
    });

    expect(
      await screen.findByText(interpolate(ru['newBudget.doneTitle'], { name: 'Семейный' })),
    ).toBeInTheDocument();
    expect(screen.getByText('Польский злотый')).toBeInTheDocument();
    expect(screen.queryByText('Доллар США')).not.toBeInTheDocument();
  });

  it('reports a failure instead of pretending the budget exists', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new Error('the network was unkind'));
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newBudget.submitFailed']);
    expect(
      screen.queryByText(interpolate(ru['newBudget.doneTitle'], { name: 'Семейный' })),
    ).not.toBeInTheDocument();
  });
});

describe('the new budget form on a phone', () => {
  const width = window.innerWidth;

  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-1' });
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  });

  const highlighted = (): string[] =>
    screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('data-selected') === 'true')
      .map((option) => option.textContent ?? '');

  it('puts the progress above the form, carrying only the step being worked on', () => {
    draw();

    expect(screen.getByText(ru['onboarding.step1Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step1Body'])).toBeInTheDocument();
    expect(screen.queryByText(ru['onboarding.step2Body'])).not.toBeInTheDocument();
    expect(comesAfterTheForm(screen.getByText(ru['onboarding.step1Body']))).toBe(false);
  });

  it('opens the currency list in a drawer rather than a popover under the thumb', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('combobox', { name: ru['newBudget.currencyLabel'] }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(ru['newBudget.currencyLabel'])).toBeInTheDocument();

    await user.type(await searchBox(), 'PLN');
    await user.click(await screen.findByRole('option', { name: /PLN/ }));

    expect(screen.getByRole('combobox', { name: ru['newBudget.currencyLabel'] })).toHaveTextContent(
      'PLN',
    );
  });

  it('picks a language from the drawer', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));

    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByRole('heading', { name: ru['newBudget.languageLabel'] }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('option', { name: localeLabels.en }));

    expect(
      await screen.findByRole('combobox', { name: en['newBudget.languageLabel'] }),
    ).toHaveTextContent(localeLabels.en);
  });

  it('highlights the language the budget will use, not whichever is listed first', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'languages', { value: ['pl-PL'], configurable: true });
    draw();

    await user.click(screen.getByRole('combobox', { name: pl['newBudget.languageLabel'] }));
    await screen.findByRole('option', { name: localeLabels.pl });

    expect(highlighted()).toEqual([localeLabels.pl]);
  });

  it('highlights no currency until one is picked', async () => {
    const user = userEvent.setup();
    draw();

    await openCurrencies(user);
    await screen.findAllByRole('option');

    expect(highlighted()).toEqual([]);
  });

  it('moves the highlight onto the currency that was picked', async () => {
    const user = userEvent.setup();
    draw();

    await openCurrencies(user);
    const rows = await screen.findAllByRole('option');
    const second = rows[1];
    if (second === undefined) {
      throw new Error('the currency list came up with fewer than two rows');
    }
    const picked = second.textContent ?? '';

    await user.click(second);
    await openCurrencies(user);
    await screen.findAllByRole('option');

    expect(highlighted()).toEqual([picked]);
  });
});

describe('the new budget form for a user who already has a budget', () => {
  const probeReads = jest.fn<Promise<string>, []>();

  function CachedElsewhere() {
    const { data } = useQuery({ queryKey: ['cached-elsewhere'], queryFn: () => probeReads() });

    return <p data-testid="cached-elsewhere">{data ?? 'nothing'}</p>;
  }

  const drawSecond = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider initialLocale="ru">
          <AdmittedStateContext.Provider value="app">
            <CachedElsewhere />
            <NewBudgetForm nameIndex={0} />
          </AdmittedStateContext.Provider>
        </LocaleProvider>
      </QueryClientProvider>,
    );

  const consent = () => screen.getByRole('checkbox', { name: ru['newBudget.consentLabel'] });
  const starters = () =>
    screen.getByRole('checkbox', { name: new RegExp(ru['newBudget.defaultsLabel']) });

  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-2' });
    probeReads.mockReset();
    probeReads.mockResolvedValue('the first budget');
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  it('describes the budget step without asking for a language', () => {
    drawSecond();

    expect(screen.getByText(ru['onboarding.step1BodyAnother'])).toBeInTheDocument();
    expect(screen.queryByText(ru['onboarding.step1Body'])).not.toBeInTheDocument();
  });

  it('carries the same heading as a first budget, and its own lead instead of the greeting', () => {
    drawSecond();

    expect(screen.getByRole('heading', { name: ru['newBudget.heading'] })).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.secondLead'])).toBeInTheDocument();
    expect(screen.queryByText(ru['newBudget.lead'])).not.toBeInTheDocument();
  });

  it('asks for no language, and sends the one the screen is speaking', async () => {
    const user = userEvent.setup();
    drawSecond();

    expect(
      screen.queryByRole('combobox', { name: ru['newBudget.languageLabel'] }),
    ).not.toBeInTheDocument();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ language: 'ru' });
  });

  it('leaves the starter categories off unless they are asked for', async () => {
    const user = userEvent.setup();
    drawSecond();

    expect(starters()).not.toBeChecked();
    expect(screen.getByText(ru['newBudget.defaultsOff'])).toBeInTheDocument();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ withDefaultCategories: false });
  });

  it('starts agreed that the new budget becomes the active one, and closes submit once that is taken back', async () => {
    const user = userEvent.setup();
    drawSecond();

    await fillOut(user);
    const button = screen.getByRole('button', { name: ru['newBudget.submit'] });

    expect(consent()).toBeChecked();
    expect(button).toBeEnabled();
    expect(screen.getByText(ru['newBudget.consentHint'])).toBeInTheDocument();

    await user.click(consent());
    expect(button).toBeDisabled();

    await user.click(consent());
    expect(button).toBeEnabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('stays the form for another budget after a refused submit', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(new Error('the network was unkind'));
    drawSecond();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newBudget.submitFailed']);
    expect(consent()).toBeChecked();
    expect(
      screen.queryByRole('combobox', { name: ru['newBudget.languageLabel'] }),
    ).not.toBeInTheDocument();
  });

  it('says under the name that the user already has a budget called that, until the name changes', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(
      Object.assign(new Error('refused'), { statusCode: 400, reason: 'NAME_TAKEN' }),
    );
    drawSecond();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    expect(await screen.findByText(ru['newBudget.nameTaken'])).toBeInTheDocument();
    expect(screen.queryByText(ru['newBudget.submitFailed'])).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(ru['newBudget.nameLabel']), ' 2');

    expect(screen.queryByText(ru['newBudget.nameTaken'])).not.toBeInTheDocument();
  });

  it('drops everything read for the previous budget once the new one exists', async () => {
    const user = userEvent.setup();
    probeReads.mockReset();
    probeReads.mockResolvedValueOnce('the first budget').mockReturnValue(new Promise(() => {}));
    drawSecond();
    const cached = () => screen.getByTestId('cached-elsewhere');

    await waitFor(() => expect(cached()).toHaveTextContent('the first budget'));

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    await waitFor(() => expect(cached()).toHaveTextContent('nothing'));
    expect(
      await screen.findByText(interpolate(ru['newBudget.doneTitle'], { name: 'Семейный' })),
    ).toBeInTheDocument();
  });
});

describe('the new budget form for a user with no budget', () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-1' });
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  it('asks for no agreement, because there is no budget to stop being active', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider initialLocale="ru">
          <AdmittedStateContext.Provider value="budget">
            <NewBudgetForm nameIndex={0} />
          </AdmittedStateContext.Provider>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('heading', { name: ru['newBudget.heading'] })).toBeInTheDocument();
  });
});

describe('the new budget form started from an existing budget', () => {
  const listed = (over: Partial<ListedBudget>): ListedBudget => ({
    id: 'budget-1',
    name: 'Домашний',
    currency: 'PLN',
    minorDigits: 2,
    timezone: 'Europe/Warsaw',
    firstMonth: '2026-01',
    createdOn: '2026-01-15',
    active: true,
    ...over,
  });

  const width = window.innerWidth;
  let client: QueryClient;

  const drawFrom = (
    address: string,
    { seeded = true, state = 'app' }: { seeded?: boolean; state?: 'app' | 'budget' } = {},
  ) => {
    openAt(address);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (seeded) {
      client.setQueryData(
        ['budgetsControllerList'],
        budgets.map((each) => ({ ...each })),
      );
    }

    return render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="ru">
          <AdmittedStateContext.Provider value={state}>
            <NewBudgetForm nameIndex={0} />
          </AdmittedStateContext.Provider>
        </LocaleProvider>
      </QueryClientProvider>,
    );
  };

  const template = () => screen.findByRole('combobox', { name: ru['newBudget.templateLabel'] });
  const templateNow = () => screen.getByRole('combobox', { name: ru['newBudget.templateLabel'] });
  const currencyField = () => screen.getByRole('combobox', { name: ru['newBudget.currencyLabel'] });
  const consent = () => screen.getByRole('checkbox', { name: ru['newBudget.consentLabel'] });
  const submitButton = () => screen.getByRole('button', { name: ru['newBudget.submit'] });
  const nameOnly = (user: ReturnType<typeof userEvent.setup>, name = 'Новый год') =>
    user.type(screen.getByLabelText(ru['newBudget.nameLabel']), name);

  const pickTemplate = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(await template());
    await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
  };

  const refusedAs = (reason: string) =>
    Object.assign(new Error('refused'), { statusCode: 400, reason });

  beforeEach(() => {
    budgets = [
      listed({ id: 'budget-2', name: 'Отпуск', currency: 'EUR', active: false }),
      listed({ id: 'budget-1', name: 'Домашний', currency: 'PLN', active: true }),
      listed({ id: 'budget-3', name: 'Запасной', currency: 'PLN', active: false }),
    ];
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-4' });
    replace.mockReset();
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  });

  it('shows the budget it starts from, with that budget’s currency, and says where the categories come from', async () => {
    drawFrom('/new?from=budget-2');

    expect(await template()).toHaveTextContent('Отпуск');
    expect(currencyField()).toHaveTextContent('EUR');
    expect(screen.getByText(ru['newBudget.templateLead'])).toBeInTheDocument();
    expect(screen.queryByText(ru['newBudget.secondLead'])).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru['newBudget.heading'] })).toBeInTheDocument();
  });

  it('shows the same once the list of budgets arrives, when the form opened before it', async () => {
    let release: () => void = () => {};
    listGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    drawFrom('/new?from=budget-2', { seeded: false });

    expect(currencyField()).not.toHaveTextContent('EUR');

    await act(async () => {
      release();
      await listGate;
    });

    expect(await template()).toHaveTextContent('Отпуск');
    await waitFor(() => expect(currencyField()).toHaveTextContent('EUR'));
  });

  it('asks for a name only, and sends the budget, its currency and no starter set', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    expect(
      screen.queryByRole('checkbox', { name: new RegExp(ru['newBudget.defaultsLabel']) }),
    ).not.toBeInTheDocument();

    await nameOnly(user);

    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({
      language: 'ru',
      name: 'Новый год',
      currency: 'EUR',
      timezone: TIMEZONE,
      withDefaultCategories: false,
      templateId: 'budget-2',
    });
  });

  it('follows another budget with its currency, and puts the choice into the address without a new entry', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    await pickTemplate(user, 'Домашний');

    await waitFor(() => expect(templateNow()).toHaveTextContent('Домашний'));
    expect(currencyField()).toHaveTextContent('PLN');
    expect(replaceState.mock.calls.at(-1)?.[2]).toBe('/new?from=budget-1');
    expect(window.location.search).toBe('?from=budget-1');
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves a currency picked by hand alone when the budget changes', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    await pickCurrency(user, 'USD', /USD/);
    await pickTemplate(user, 'Домашний');
    await waitFor(() => expect(templateNow()).toHaveTextContent('Домашний'));
    expect(currencyField()).toHaveTextContent('USD');

    await nameOnly(user);
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ currency: 'USD', templateId: 'budget-1' });
  });

  it('says beside the agreement what starts at zero, starts agreed, and closes submit without it', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    expect(screen.getByText(ru['newBudget.templateConsentHint'])).toBeInTheDocument();

    await nameOnly(user);
    expect(consent()).toBeChecked();
    expect(submitButton()).toBeEnabled();

    await user.click(consent());
    expect(submitButton()).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('says goals stay behind while the currency differs from the budget’s, and only then', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    expect(screen.queryByText(ru['newBudget.templateGoalsStay'])).not.toBeInTheDocument();

    await pickCurrency(user, 'PLN', /PLN/);
    expect(screen.getByText(ru['newBudget.templateGoalsStay'])).toBeInTheDocument();

    await pickTemplate(user, 'Домашний');
    await waitFor(() =>
      expect(screen.queryByText(ru['newBudget.templateGoalsStay'])).not.toBeInTheDocument(),
    );
  });

  it('ends on the opening balances step, which it shows as the one to do next', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    await user.click(submitButton());

    expect(
      await screen.findByText(interpolate(ru['newBudget.doneTitle'], { name: 'Новый год' })),
    ).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.doneFromTemplate'])).toBeInTheDocument();
    expect(screen.getByText('Евро')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru['newBudget.balances'] })).toHaveAttribute(
      'href',
      '/new/balances',
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.getByText(interpolate(ru['onboarding.progress'], { step: 2 })),
    ).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step2BodyCopy'])).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('retries a lost request under another key once the budget it starts from has changed', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValueOnce(new Error('the network was unkind'));
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newBudget.submitFailed']);

    await pickTemplate(user, 'Запасной');
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(bodyOf(0)).toMatchObject({ templateId: 'budget-2' });
    expect(bodyOf(1)).toMatchObject({ templateId: 'budget-3' });
    expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
  });

  it('closes the choice of budget while the request is in flight', async () => {
    const user = userEvent.setup();
    submit.mockReturnValue(new Promise(() => {}));
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    expect(await template()).toBeEnabled();
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(await template()).toBeDisabled();
  });

  it('falls back to the active budget and asks to agree again when the chosen one is gone', async () => {
    const user = userEvent.setup();
    submit.mockImplementationOnce(() => {
      budgets = budgets.filter((each) => each.id !== 'budget-2');

      return Promise.reject(refusedAs('UNKNOWN_BUDGET'));
    });
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newBudget.submitFailed']);
    await waitFor(() => expect(templateNow()).toHaveTextContent('Домашний'));
    expect(currencyField()).toHaveTextContent('PLN');
    expect(consent()).not.toBeChecked();
    expect(submitButton()).toBeDisabled();
    await waitFor(() => expect(window.location.search).toBe('?from=budget-1'));

    await user.click(consent());
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ templateId: 'budget-1', currency: 'PLN' });
    expect(bodyOf(1)['idempotencyKey']).not.toBe(bodyOf(0)['idempotencyKey']);
  });

  it('stops offering a budget the server said is gone', async () => {
    const user = userEvent.setup();
    submit.mockImplementationOnce(() => {
      budgets = budgets.filter((each) => each.id !== 'budget-2');

      return Promise.reject(refusedAs('UNKNOWN_BUDGET'));
    });
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    await user.click(submitButton());
    await waitFor(() => expect(templateNow()).toHaveTextContent('Домашний'));

    await user.click(templateNow());

    expect(await screen.findByRole('option', { name: /Запасной/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Отпуск/ })).not.toBeInTheDocument();
  });

  it('keeps the chosen budget and the agreement after a failure that says nothing about the budget', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValue(Object.assign(new Error('down'), { statusCode: 500 }));
    drawFrom('/new?from=budget-2');
    await template();

    await nameOnly(user);
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['newBudget.submitFailed']);
    expect(await template()).toHaveTextContent('Отпуск');
    expect(consent()).toBeChecked();
    expect(window.location.search).toBe('?from=budget-2');
  });

  it('starts from the active budget when the address names one the user does not have', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-nobody-has');

    expect(await template()).toHaveTextContent('Домашний');
    expect(currencyField()).toHaveTextContent('PLN');
    await waitFor(() => expect(window.location.search).toBe('?from=budget-1'));

    await nameOnly(user);
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ templateId: 'budget-1', currency: 'PLN' });
  });

  it('opens the choice of budget in a drawer on a phone', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');

    await user.click(await template());

    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByRole('heading', { name: ru['newBudget.templateLabel'] }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('option', { name: /Домашний/ }));

    await waitFor(() => expect(templateNow()).toHaveTextContent('Домашний'));
    expect(window.location.search).toBe('?from=budget-1');
  });

  it('describes the steps of a copy, where the accounts only need their opening balances', async () => {
    drawFrom('/new?from=budget-2');
    await template();

    expect(screen.getByText(ru['onboarding.step1BodyCopy'])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step2BodyCopy'])).toBeInTheDocument();
    expect(screen.queryByText(ru['onboarding.step2Body'])).not.toBeInTheDocument();
  });

  it('offers every budget the user has to start from', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2');

    await user.click(await template());

    const offered = await screen.findAllByRole('option');
    expect(offered.map((option) => option.textContent)).toEqual(['Отпуск', 'Домашний', 'Запасной']);
  });

  it('ignores a budget named in the address while the user is making their first', async () => {
    const user = userEvent.setup();
    drawFrom('/new?from=budget-2', { state: 'budget' });

    expect(
      screen.getByRole('checkbox', { name: new RegExp(ru['newBudget.defaultsLabel']) }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: ru['newBudget.templateLabel'] }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.lead'])).toBeInTheDocument();

    await fillOut(user);
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toMatchObject({ withDefaultCategories: true, currency: 'PLN' });
    expect(bodyOf(0)).not.toHaveProperty('templateId');
    expect(window.location.search).toBe('?from=budget-2');
  });

  it('stays the plain form for another budget when the address names none', async () => {
    const user = userEvent.setup();
    drawFrom('/new');

    expect(screen.getByText(ru['newBudget.secondLead'])).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: new RegExp(ru['newBudget.defaultsLabel']) }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole('combobox', { name: ru['newBudget.templateLabel'] }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(ru['newBudget.templateConsentHint'])).not.toBeInTheDocument();

    await fillOut(user);
    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).not.toHaveProperty('templateId');
    expect(window.location.search).toBe('');
  });
});
