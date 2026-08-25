import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LocaleProvider, useTranslations } from '@/i18n/locale-context';
import { localeLabels } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';
import { ru } from '@/i18n/messages/ru';
import { SettingsLocaleSync } from '@/i18n/settings-locale';
import { ApiProvider } from '@/lib/api';

import type { ReactNode } from 'react';

const readSettings = jest.fn<Promise<{ language: string }>, []>();

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
}));

function DemoText() {
  const { t } = useTranslations();
  return <p>{t('nav.categories')}</p>;
}

function SettingsProbe() {
  const { data } = useQuery(settingsOptions);
  return <span>settings:{data?.language ?? 'pending'}</span>;
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

describe('SettingsLocaleSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readSettings.mockReset();
    mockUserId = 'user_a';
    mockIsSignedIn = true;
    mockIsLoaded = true;
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
  });

  it('renders the interface in the language the settings report', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    render(<App />);

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
  });

  it('does not undo a choice the user makes afterwards', async () => {
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'pl' });

    const { rerender } = render(
      <App>
        <LocaleSwitcher />
      </App>,
    );
    await screen.findByText(pl['nav.categories']);

    await user.click(screen.getByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));

    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    expect(await screen.findByText(ru['nav.categories'])).toBeInTheDocument();
  });

  it('leaves a choice made on an earlier visit in place', async () => {
    window.localStorage.setItem('rondo.locale:user_a', 'ru');
    readSettings.mockResolvedValue({ language: 'pl' });

    render(
      <App>
        <SettingsProbe />
      </App>,
    );

    expect(screen.getByText(ru['nav.categories'])).toBeInTheDocument();

    expect(await screen.findByText('settings:pl')).toBeInTheDocument();
    expect(screen.getByText(ru['nav.categories'])).toBeInTheDocument();
    expect(screen.queryByText(pl['nav.categories'])).not.toBeInTheDocument();
  });

  it("does not hand the next user to sign in the previous one's choice", async () => {
    const user = userEvent.setup();
    readSettings.mockImplementation(() =>
      Promise.resolve({ language: mockUserId === 'user_a' ? 'en' : 'pl' }),
    );

    const { rerender } = render(
      <App>
        <LocaleSwitcher />
      </App>,
    );
    await screen.findByText(en['nav.categories']);
    await user.click(screen.getByRole('button', { name: en['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));
    await screen.findByText(ru['nav.categories']);

    mockUserId = 'user_b';
    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    expect(await screen.findByText(pl['nav.categories'])).toBeInTheDocument();
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru');
    expect(window.localStorage.getItem('rondo.locale:user_b')).toBeNull();
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

  it('keeps a pick made before Clerk has said who is signed in', async () => {
    mockIsLoaded = false;
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'en' });

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

    expect(await screen.findByText(ru['nav.categories'])).toBeInTheDocument();
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru');
  });

  it('leaves the browser to decide while the settings are still loading', async () => {
    readSettings.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(await screen.findByText(en['nav.categories'])).toBeInTheDocument();
  });
});
