import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsPanel } from '@/components/settings-panel';
import { LocaleProvider } from '@/i18n/locale-context';
import { localeLabels, type Locale } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';
import { SettingsLocaleSync } from '@/i18n/settings-locale';
import { ApiProvider } from '@/lib/api';

const readSettings = jest.fn<Promise<{ language: Locale }>, []>();
const writeSettings = jest.fn<Promise<{ language: Locale }>, [Locale]>();
const erases = jest.fn<Promise<{ userId: string }>, [string]>();
const deletesTheUser = jest.fn<Promise<void>, []>();
const replaced = jest.fn<void, [string]>();
const probeReads = jest.fn<Promise<string>, []>();

function CachedElsewhere() {
  const { data } = useQuery({ queryKey: ['cached-elsewhere'], queryFn: () => probeReads() });

  return <p data-testid="cached-elsewhere">{data ?? 'nothing'}</p>;
}

const settingsOptions = {
  queryKey: ['userSettingsControllerRead'],
  queryFn: () => readSettings(),
};

jest.mock('@clerk/nextjs', () => ({
  ...jest.requireActual('@clerk/nextjs'),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_a',
    getToken: () => Promise.resolve(null),
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { delete: () => deletesTheUser() },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (path: string) => replaced(path), push: () => {} }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  userSettingsControllerReadOptions: () => settingsOptions,
  userSettingsControllerReadQueryKey: () => settingsOptions.queryKey,
  userSettingsControllerUpdateMutation: () => ({
    mutationFn: ({ body }: { body: { language: Locale } }) => writeSettings(body.language),
  }),
  meControllerEraseMutation: () => ({
    mutationFn: ({ body }: { body: { idempotencyKey: string } }) => erases(body.idempotencyKey),
  }),
}));

function browserPrefers(scheme: 'dark' | 'light') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('dark') && scheme === 'dark',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function renderPanel(extra?: React.ReactNode) {
  return render(
    <LocaleProvider>
      <ApiProvider>
        <SettingsLocaleSync />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {extra}
          <SettingsPanel />
        </ThemeProvider>
      </ApiProvider>
    </LocaleProvider>,
  );
}

const languageTrigger = () => screen.getByRole('combobox', { name: en['settings.language'] });
const themeTrigger = () => screen.getByRole('combobox', { name: en['settings.theme'] });

describe('the settings screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    readSettings.mockReset();
    readSettings.mockResolvedValue({ language: 'en' });
    writeSettings.mockReset();
    writeSettings.mockImplementation((language) => Promise.resolve({ language }));
    browserPrefers('light');
    Object.defineProperty(window.navigator, 'languages', {
      value: ['en-US'],
      configurable: true,
    });
  });

  it('shows the language the account holds', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    renderPanel();

    expect(await screen.findByText(localeLabels.pl)).toBeInTheDocument();
  });

  it('offers the languages the app renders, and nothing that is not one', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(localeLabels.en);

    await user.click(languageTrigger());

    expect(await screen.findAllByRole('option')).toHaveLength(3);
    for (const label of Object.values(localeLabels)) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('sends the chosen language and speaks it at once', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(localeLabels.en);

    await user.click(languageTrigger());
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    await waitFor(() => expect(writeSettings).toHaveBeenCalledWith('pl'));
    expect(await screen.findByText(pl['settings.theme'])).toBeInTheDocument();
  });

  it('names the language the screen is speaking, not the one the account last answered', async () => {
    const user = userEvent.setup();
    writeSettings.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await screen.findByText(localeLabels.en);

    await user.click(languageTrigger());
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    await waitFor(() => expect(writeSettings).toHaveBeenCalledWith('pl'));
    expect(await screen.findByText(pl['settings.theme'], { exact: true })).toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: pl['settings.language'] });
    expect(within(trigger).getByText(localeLabels.pl)).toBeInTheDocument();
  });

  it('takes no second language while the first one is still on its way', async () => {
    const user = userEvent.setup();
    writeSettings.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await screen.findByText(localeLabels.en);

    await user.click(languageTrigger());
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    await waitFor(() => expect(writeSettings).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: pl['settings.language'] })).toBeDisabled(),
    );
  });

  it('puts the language back when the account refuses to take it', async () => {
    const user = userEvent.setup();
    writeSettings.mockRejectedValue(new Error('network'));
    renderPanel();
    await screen.findByText(localeLabels.en);

    await user.click(languageTrigger());
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['settings.saveFailed']);
    expect(within(languageTrigger()).getByText(localeLabels.en)).toBeInTheDocument();
  });

  it('reads the theme as system rather than as the light it resolves to', async () => {
    renderPanel();

    expect(await screen.findByText(en['settings.themeSystem'])).toBeInTheDocument();
  });

  it('turns the dark theme on when it is chosen', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(en['settings.themeSystem']);

    await user.click(themeTrigger());
    await user.click(await screen.findByRole('option', { name: en['settings.themeDark'] }));

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('hands the theme back to the browser when the browser is what was chosen', async () => {
    const user = userEvent.setup();
    browserPrefers('dark');
    renderPanel();
    await screen.findByText(en['settings.themeSystem']);

    await user.click(themeTrigger());
    await user.click(await screen.findByRole('option', { name: en['settings.themeLight'] }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));

    await user.click(themeTrigger());
    await user.click(await screen.findByRole('option', { name: en['settings.themeSystem'] }));

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('agrees with the theme control in the header', async () => {
    const user = userEvent.setup();
    renderPanel(<ThemeToggle label="toggle" />);
    await screen.findByText(en['settings.themeSystem']);

    await user.click(screen.getByRole('button', { name: 'toggle' }));

    expect(await screen.findByText(en['settings.themeDark'])).toBeInTheDocument();
  });

  it('fades the screen out before it switches the language, not at the click', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(localeLabels.en);
    const panel = screen.getByTestId('settings-panel');

    await user.click(languageTrigger());
    await user.click(await screen.findByRole('option', { name: localeLabels.pl }));

    expect(panel).toHaveClass('opacity-0');
    expect(writeSettings).not.toHaveBeenCalled();

    await waitFor(() => expect(writeSettings).toHaveBeenCalledWith('pl'));
    await waitFor(() => expect(panel).toHaveClass('opacity-100'));
  });

  it('applies the theme at once, and does not fade the screen with it', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(en['settings.themeSystem']);

    await user.click(themeTrigger());
    await user.click(await screen.findByRole('option', { name: en['settings.themeDark'] }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('settings-panel')).toHaveClass('opacity-100');
  });

  it('draws each theme with an icon of its own', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(en['settings.themeSystem']);

    await user.click(themeTrigger());

    for (const label of [
      en['settings.themeSystem'],
      en['settings.themeLight'],
      en['settings.themeDark'],
    ]) {
      const option = await screen.findByRole('option', { name: label });
      expect(option.querySelector('svg')).not.toBeNull();
    }
  });

  it('explains under each field where that setting lives', async () => {
    renderPanel();

    expect(await screen.findByText(en['settings.languageNote'])).toBeInTheDocument();
    expect(screen.getByText(en['settings.themeNote'])).toBeInTheDocument();
  });
});

describe('the danger zone', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readSettings.mockReset();
    readSettings.mockResolvedValue({ language: 'en' });
    erases.mockReset();
    erases.mockResolvedValue({ userId: 'user_a' });
    deletesTheUser.mockReset();
    deletesTheUser.mockResolvedValue(undefined);
    replaced.mockReset();
    browserPrefers('light');
  });

  const open = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
    await screen.findByText(localeLabels.en);
    await user.click(screen.getByRole('button', { name: action }));
  };

  const confirm = async (
    user: ReturnType<typeof userEvent.setup>,
    phrase: string,
    button: string,
  ) => {
    await user.type(await screen.findByRole('textbox'), phrase);
    await user.click(screen.getByRole('button', { name: button }));
  };

  it('offers both an erase and an account deletion', async () => {
    renderPanel();
    await screen.findByText(localeLabels.en);

    expect(screen.getByRole('button', { name: en['settings.reset'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.delete'] })).toBeInTheDocument();
  });

  it('mints a key of its own for each action, and never shares one between them', async () => {
    const user = userEvent.setup();
    renderPanel();

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(1));

    await open(user, en['settings.delete']);
    await confirm(user, en['settings.deletePhrase'], en['settings.deleteConfirm']);
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(2));

    const [first] = erases.mock.calls[0] ?? [];
    const [second] = erases.mock.calls[1] ?? [];
    expect(first).toEqual(expect.any(String));
    expect(second).not.toBe(first);
  });

  it('keeps the key when the request was lost, and mints a new one once it was refused', async () => {
    const user = userEvent.setup();
    erases.mockRejectedValue(new Error('network'));
    renderPanel();

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: en['settings.resetConfirm'] }));
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(2));
    expect(erases.mock.calls[1]?.[0]).toBe(erases.mock.calls[0]?.[0]);

    erases.mockRejectedValue(Object.assign(new Error('refused'), { statusCode: 409 }));
    await user.click(screen.getByRole('button', { name: en['settings.resetConfirm'] }));
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole('button', { name: en['settings.resetConfirm'] }));
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(4));
    expect(erases.mock.calls[3]?.[0]).not.toBe(erases.mock.calls[2]?.[0]);
  });

  it('stays open and moves nobody when the erase itself is refused', async () => {
    const user = userEvent.setup();
    erases.mockRejectedValue(Object.assign(new Error('refused'), { statusCode: 409 }));
    renderPanel();

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);

    expect(await screen.findByRole('alert')).toHaveTextContent(en['settings.eraseFailedConflict']);
    expect(screen.getByRole('button', { name: en['settings.resetConfirm'] })).toBeInTheDocument();
    expect(replaced).not.toHaveBeenCalled();
  });

  it('sends the reader to the budget form after an erase, still signed in', async () => {
    const user = userEvent.setup();
    renderPanel();

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);

    await waitFor(() => expect(replaced).toHaveBeenCalledWith('/new'));
    expect(deletesTheUser).not.toHaveBeenCalled();
    await waitFor(() => expect(readSettings.mock.calls.length).toBeGreaterThan(1));
  });

  it('deletes the account and sends the reader to the sign-in screen', async () => {
    const user = userEvent.setup();
    renderPanel();

    await open(user, en['settings.delete']);
    await confirm(user, en['settings.deletePhrase'], en['settings.deleteConfirm']);

    await waitFor(() => expect(deletesTheUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replaced).toHaveBeenCalledWith('/sign-in'));
  });

  it('asks the account for nothing more while the deletion is still in flight', async () => {
    const user = userEvent.setup();
    deletesTheUser.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await screen.findByText(localeLabels.en);
    const readsBefore = readSettings.mock.calls.length;

    await open(user, en['settings.delete']);
    await confirm(user, en['settings.deletePhrase'], en['settings.deleteConfirm']);

    await waitFor(() => expect(deletesTheUser).toHaveBeenCalledTimes(1));
    expect(readSettings.mock.calls.length).toBe(readsBefore);
    expect(replaced).not.toHaveBeenCalled();
  });

  it('moves the reader off the shell when the data went but the account stayed', async () => {
    const user = userEvent.setup();
    deletesTheUser.mockRejectedValue(new Error('clerk refused'));
    renderPanel();

    await open(user, en['settings.delete']);
    await confirm(user, en['settings.deletePhrase'], en['settings.deleteConfirm']);
    expect(await screen.findByRole('alert')).toHaveTextContent(en['settings.eraseFailedAccount']);

    await user.click(screen.getByRole('button', { name: en['settings.eraseCancel'] }));

    await waitFor(() => expect(replaced).toHaveBeenCalledWith('/new'));
  });

  it('drops what another screen had cached, so nothing can draw the budget that is gone', async () => {
    const user = userEvent.setup();
    probeReads.mockReset();
    probeReads.mockResolvedValueOnce('the erased budget').mockReturnValue(new Promise(() => {}));
    renderPanel(<CachedElsewhere />);
    const cached = () => screen.getByTestId('cached-elsewhere');

    await waitFor(() => expect(cached()).toHaveTextContent('the erased budget'));

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);

    await waitFor(() => expect(cached()).toHaveTextContent('nothing'));
  });

  it('refuses to be dismissed while the erase is still in flight', async () => {
    const user = userEvent.setup();
    erases.mockReturnValue(new Promise(() => {}));
    renderPanel();

    await open(user, en['settings.reset']);
    await confirm(user, en['settings.resetPhrase'], en['settings.resetConfirm']);
    await waitFor(() => expect(erases).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: en['settings.eraseCancel'] }));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.eraseCancel'] })).toBeDisabled();
  });

  it('says the data is gone when the account itself could not be deleted', async () => {
    const user = userEvent.setup();
    deletesTheUser.mockRejectedValue(new Error('clerk refused'));
    renderPanel();

    await open(user, en['settings.delete']);
    await confirm(user, en['settings.deletePhrase'], en['settings.deleteConfirm']);

    expect(await screen.findByRole('alert')).toHaveTextContent(en['settings.eraseFailedAccount']);
    expect(replaced).not.toHaveBeenCalled();
  });
});
