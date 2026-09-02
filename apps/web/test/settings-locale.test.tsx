import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LocaleProvider, useTranslations } from '@/i18n/locale-context';
import { localeLabels, type Locale } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';
import { ru } from '@/i18n/messages/ru';
import { SettingsLocaleSync, useLanguageChoice } from '@/i18n/settings-locale';
import { ApiProvider } from '@/lib/api';

import type { ReactNode } from 'react';

const readSettings = jest.fn<Promise<{ language: Locale }>, []>();
const writeSettings = jest.fn<Promise<{ language: Locale }>, [Locale]>();

const settingsOptions = {
  queryKey: ['userSettingsControllerRead'],
  queryFn: () => readSettings(),
};

let mockUserId: string | null = 'user_a';
let mockIsSignedIn = true;
let mockIsLoaded = true;

jest.mock('@clerk/nextjs', () => ({
  ...jest.requireActual('@clerk/nextjs'),
  useAuth: () => ({
    isLoaded: mockIsLoaded,
    isSignedIn: mockIsSignedIn,
    userId: mockUserId,
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

function DemoText() {
  const { t } = useTranslations();
  return <p>{t('nav.categories')}</p>;
}

function SettingsProbe() {
  const { data } = useQuery(settingsOptions);
  return <span>settings:{data?.language ?? 'pending'}</span>;
}

function Chooser({ to }: { to: Locale }) {
  const { language, choose } = useLanguageChoice();

  return (
    <button type="button" onClick={() => choose(to)}>
      chooser:{language}
    </button>
  );
}

function App({ children }: { children?: ReactNode }) {
  return (
    <LocaleProvider>
      <ApiProvider>
        <SettingsLocaleSync />
        {children}
        <DemoText />
      </ApiProvider>
    </LocaleProvider>
  );
}

function speaks(...languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

describe('SettingsLocaleSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readSettings.mockReset();
    writeSettings.mockReset();
    writeSettings.mockImplementation((language) => Promise.resolve({ language }));
    mockUserId = 'user_a';
    mockIsSignedIn = true;
    mockIsLoaded = true;
    speaks('en-US');
  });

  it('renders the interface in the language the settings report', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    render(<App />);

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
  });

  it('shows the stored language first, then hands the screen to the account', async () => {
    window.localStorage.setItem('rondo.locale:user_a', 'ru');
    readSettings.mockResolvedValue({ language: 'pl' });

    render(
      <App>
        <SettingsProbe />
      </App>,
    );

    expect(screen.getByText(ru['nav.categories'])).toBeInTheDocument();

    expect(await screen.findByText('settings:pl')).toBeInTheDocument();
    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
  });

  it('keeps a choice made while the account is still answering', async () => {
    const user = userEvent.setup();
    let answer: (settings: { language: Locale }) => void = () => {};
    readSettings.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    render(
      <App>
        <Chooser to="ru" />
      </App>,
    );

    await user.click(screen.getByRole('button'));
    expect(await screen.findByText(ru['nav.categories'])).toBeInTheDocument();

    answer({ language: 'pl' });

    await waitFor(() => expect(writeSettings).toHaveBeenCalledWith('ru'));
    expect(screen.getByText(ru['nav.categories'])).toBeInTheDocument();
  });

  it('sends the choice to the account and switches without a reload', async () => {
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'en' });

    render(
      <App>
        <Chooser to="pl" />
      </App>,
    );
    await screen.findByText(en['nav.categories']);

    await user.click(screen.getByRole('button', { name: 'chooser:en' }));

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
    expect(writeSettings).toHaveBeenCalledWith('pl');
    expect(await screen.findByRole('button', { name: 'chooser:pl' })).toBeInTheDocument();
  });

  it('falls back to English when the browser speaks a language the app cannot', async () => {
    speaks('de-DE');
    readSettings.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(await screen.findByText(en['nav.categories'])).toBeInTheDocument();
  });

  it('renders what it stored last time while the account is still answering', async () => {
    window.localStorage.setItem('rondo.locale:user_a', 'pl');
    speaks('ru-RU');
    readSettings.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText(pl['nav.categories'])).toBeInTheDocument();
  });

  it('treats an answer carrying no language as no answer yet, rather than breaking', async () => {
    window.localStorage.setItem('rondo.locale:user_a', 'ru');
    speaks('pl-PL');
    readSettings.mockResolvedValue({} as { language: Locale });

    render(<App />);

    expect(await screen.findByText(ru['nav.categories'])).toBeInTheDocument();
  });

  it('stores the language it settled on, so the next first frame opens on it', async () => {
    speaks('ru-RU');
    readSettings.mockResolvedValue({ language: 'pl' });

    render(<App />);
    await screen.findByText(pl['nav.categories']);

    await waitFor(() => expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('pl'));
  });

  it("does not hand the next user to sign in the previous one's language", async () => {
    readSettings.mockImplementation(() =>
      Promise.resolve({ language: mockUserId === 'user_a' ? 'ru' : 'pl' }),
    );

    const { rerender } = render(<App />);
    await screen.findByText(ru['nav.categories']);
    await waitFor(() => expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru'));

    mockUserId = 'user_b';
    rerender(<App />);

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru');
    await waitFor(() => expect(window.localStorage.getItem('rondo.locale:user_b')).toBe('pl'));
  });

  it('leaves a choice made inside an account behind when the user signs out', async () => {
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'en' });

    const { rerender } = render(
      <App>
        <Chooser to="ru" />
      </App>,
    );
    await screen.findByText(en['nav.categories']);
    await user.click(screen.getByRole('button', { name: 'chooser:en' }));
    await screen.findByText(ru['nav.categories']);

    mockUserId = null;
    mockIsSignedIn = false;
    rerender(
      <App>
        <Chooser to="ru" />
      </App>,
    );

    expect(await screen.findByText(en['nav.categories'])).toBeInTheDocument();
  });

  it('forgets the settings language when the user signs out', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    const { rerender } = render(<App />);
    await screen.findByText(pl['nav.categories']);

    mockUserId = null;
    mockIsSignedIn = false;
    rerender(<App />);

    expect(await screen.findByText(en['nav.categories'])).toBeInTheDocument();
  });

  it('shows a pick made on the sign-in screen until the account answers, then follows it', async () => {
    mockIsLoaded = false;
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'pl' });

    const { rerender } = render(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    await user.click(screen.getByRole('button', { name: en['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));
    expect(await screen.findByText(ru['nav.categories'])).toBeInTheDocument();

    mockIsLoaded = true;
    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
    expect(window.localStorage.getItem('rondo.locale')).toBe('ru');
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('pl');
  });

  it('leaves the browser to decide while the settings are still loading', async () => {
    readSettings.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(await screen.findByText(en['nav.categories'])).toBeInTheDocument();
  });

  it('renders the account language when storage cannot be reached at all', async () => {
    const storage = jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    readSettings.mockResolvedValue({ language: 'pl' });

    try {
      render(<App />);

      expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
    } finally {
      storage.mockRestore();
    }
  });
});
