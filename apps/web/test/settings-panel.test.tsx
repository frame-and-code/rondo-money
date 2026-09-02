import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
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
}));

jest.mock('@rondo/api-client/react-query', () => ({
  userSettingsControllerReadOptions: () => settingsOptions,
  userSettingsControllerReadQueryKey: () => settingsOptions.queryKey,
  userSettingsControllerUpdateMutation: () => ({
    mutationFn: ({ body }: { body: { language: Locale } }) => writeSettings(body.language),
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
    document.documentElement.classList.remove('dark', 'theme-switching');
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

  it('marks the colours for crossing when the theme changes, and does not fade the screen', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(en['settings.themeSystem']);

    await user.click(themeTrigger());
    await user.click(await screen.findByRole('option', { name: en['settings.themeDark'] }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('settings-panel')).toHaveClass('opacity-100');

    await waitFor(() =>
      expect(document.documentElement.classList.contains('theme-switching')).toBe(false),
    );
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
