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

/**
 * F1.6: the interface follows the language held in the user's settings — and stops short of
 * overruling the user themselves, or of carrying one account's choice into the next one's
 * session on a shared browser.
 *
 * The generated query options are mocked rather than the network: what is worth proving here
 * is the precedence between three sources, and a real request would only add a fetch polyfill
 * to the list of things that can break. The rest of the tree is the real one — the provider
 * nesting from `app/layout.tsx`, `ApiProvider` included, because the cache it swaps per
 * identity is half of what these scenarios exercise.
 */

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
  return <p>{t('home.demoTitle')}</p>;
}

/**
 * Shows the settings the sync component is reacting to, off the same cache entry.
 *
 * It exists for the assertions that have no visible effect of their own: "the settings said
 * `pl` and the interface stayed Russian" is only worth something once the `pl` has actually
 * arrived, and without this it would pass just as happily against a query still in flight.
 */
function SettingsProbe() {
  const { data } = useQuery(settingsOptions);
  return <span>settings:{data?.language ?? 'pending'}</span>;
}

/** The provider nesting of `app/layout.tsx`, minus Clerk's own provider (mocked above). */
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
    // English, so anything the settings do is visible against it.
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
  });

  it('renders the interface in the language the settings report', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    render(<App />);

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();
  });

  it('does not undo a choice the user makes afterwards', async () => {
    const user = userEvent.setup();
    readSettings.mockResolvedValue({ language: 'pl' });

    const { rerender } = render(
      <App>
        <LocaleSwitcher />
      </App>,
    );
    await screen.findByText(pl['home.demoTitle']);

    await user.click(screen.getByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));

    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    // Until Phase 7 the server never hears about the pick, so settings that still say `pl`
    // must not win it back on the next render — which is the whole reason the choice is kept
    // on the device at all.
    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();
  });

  it('leaves a choice made on an earlier visit in place', async () => {
    window.localStorage.setItem('rondo.locale:user_a', 'ru');
    readSettings.mockResolvedValue({ language: 'pl' });

    render(
      <App>
        <SettingsProbe />
      </App>,
    );

    // Russian as soon as the tree is mounted, before anything has been fetched.
    expect(screen.getByText(ru['home.demoTitle'])).toBeInTheDocument();

    expect(await screen.findByText('settings:pl')).toBeInTheDocument();
    expect(screen.getByText(ru['home.demoTitle'])).toBeInTheDocument();
    expect(screen.queryByText(pl['home.demoTitle'])).not.toBeInTheDocument();
  });

  // Browsers get shared. A pick is stored under the account that made it, so the next person to
  // sign in reads their own settings — not a language they never chose and, because a pick
  // outranks settings, could not get rid of by any means the app offers.
  it("does not hand the next user to sign in the previous one's choice", async () => {
    const user = userEvent.setup();
    // Different answers per account, so this also fails if B were served A's cached settings.
    readSettings.mockImplementation(() =>
      Promise.resolve({ language: mockUserId === 'user_a' ? 'en' : 'pl' }),
    );

    const { rerender } = render(
      <App>
        <LocaleSwitcher />
      </App>,
    );
    await screen.findByText(en['home.demoTitle']);
    await user.click(screen.getByRole('button', { name: en['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));
    await screen.findByText(ru['home.demoTitle']);

    mockUserId = 'user_b';
    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru');
    expect(window.localStorage.getItem('rondo.locale:user_b')).toBeNull();
  });

  // Signing out disables the query, so nothing new arrives to overwrite the language with —
  // it has to be dropped on the way out, or the sign-in screen greets the next visitor in the
  // departed user's language.
  it('forgets the settings language when the user signs out', async () => {
    readSettings.mockResolvedValue({ language: 'pl' });

    const { rerender } = render(<App />);
    await screen.findByText(pl['home.demoTitle']);

    mockUserId = null;
    mockIsSignedIn = false;
    rerender(<App />);

    expect(await screen.findByText(en['home.demoTitle'])).toBeInTheDocument();
  });

  // Clerk answers a beat after the first paint, and the switcher is on screen for that beat.
  // A pick made in it was made by whoever turns out to be signed in — dropping it is the exact
  // defect this feature exists to remove, and it would be invisible: the interface simply
  // snaps back a moment later.
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
    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();

    mockIsLoaded = true;
    rerender(
      <App>
        <LocaleSwitcher />
      </App>,
    );

    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();
    // Re-homed under the account it turned out to belong to, so the next visit restores it.
    expect(window.localStorage.getItem('rondo.locale:user_a')).toBe('ru');
  });

  it('leaves the browser to decide while the settings are still loading', async () => {
    readSettings.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(await screen.findByText(en['home.demoTitle'])).toBeInTheDocument();
  });
});
