import { supportedCurrencyCodes } from '@rondo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewBudgetForm } from '@/components/new-budget-form';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import { localeLabels } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';
import { ru } from '@/i18n/messages/ru';

const submit = jest.fn();

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerCreateMutation: () => ({
    mutationFn: (options: unknown) => submit(options) as unknown,
  }),
  budgetsControllerListQueryKey: () => ['budgetsControllerList'],
}));

/// Read here rather than pinned, so the assertion is "the form sends the browser's zone"
/// rather than "the form sends Europe/Warsaw".
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    submit.mockReset();
    submit.mockResolvedValue({ id: 'budget-1' });
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  it('explains what the budget is for before asking for anything', () => {
    draw();

    expect(screen.getByRole('heading', { name: ru['newBudget.heading'] })).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.lead'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point1Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point2Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point3Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.cardTitle'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.cardDescription'])).toBeInTheDocument();
  });

  it('puts the explainer beside the form, where the wide layout has room for it', () => {
    draw();

    expect(comesAfterTheForm(screen.getByText(ru['newBudget.point1Title']))).toBe(false);
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

  it('warns that the currency is permanent, and shows what an amount will look like', async () => {
    const user = userEvent.setup();
    draw();

    expect(screen.getByText(ru['newBudget.currencyLocked'])).toBeInTheDocument();

    await pickCurrency(user, 'PLN', /PLN/);

    const sample = new Intl.NumberFormat('ru', { style: 'currency', currency: 'PLN' }).format(
      1234.5,
    );
    // Whitespace only: the formatter separates groups with a no-break space, which the DOM
    // query normalises away. Everything else still comes from Intl rather than a pinned string.
    const shown = new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'));
    expect(screen.getByText(shown)).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.currencyLocked'])).toBeInTheDocument();
  });

  it('switches every label and the currency names when the language changes', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('combobox', { name: ru['newBudget.languageLabel'] }));
    await user.click(await screen.findByRole('option', { name: localeLabels.en }));

    expect(await screen.findByText(en['newBudget.heading'])).toBeInTheDocument();
    expect(screen.getByText(en['newBudget.cardDescription'])).toBeInTheDocument();

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

  it('names the budget it created and says what comes next', async () => {
    const user = userEvent.setup();
    draw();

    await fillOut(user);
    await user.click(screen.getByRole('button', { name: ru['newBudget.submit'] }));

    expect(
      await screen.findByText(interpolate(ru['newBudget.doneTitle'], { name: 'Семейный' })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(interpolate(ru['newBudget.doneWithDefaults'], { currency: 'PLN' })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  });

  it('keeps the explainer, moving it under the form instead of dropping it', () => {
    draw();

    expect(screen.getByText(ru['newBudget.point1Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point2Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point3Title'])).toBeInTheDocument();
    expect(screen.getByText(ru['newBudget.point3Body'])).toBeInTheDocument();
    expect(comesAfterTheForm(screen.getByText(ru['newBudget.point1Title']))).toBe(true);
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
});
