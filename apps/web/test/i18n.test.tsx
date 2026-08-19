import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { interpolate, LocaleProvider, useTranslations } from '@/i18n/locale-context';
import { localeLabels } from '@/i18n/locales';
import { pl } from '@/i18n/messages/pl';
import { ru } from '@/i18n/messages/ru';

function DemoText() {
  const { t } = useTranslations();
  return <p>{t('home.demoTitle')}</p>;
}

/**
 * Stands in for what `SettingsLocaleSync` reports to a visitor with no session — the sign-in
 * screen, which is where these scenarios live.
 *
 * `LocaleProvider` files a pick under the account that made it and cannot read the session
 * itself, so until somebody names an owner it has nowhere to persist to. Naming one here is
 * not scaffolding around the test: it is the same call the real tree makes, and leaving it out
 * would test a composition the app never renders.
 */
function SignedOut() {
  const { applySettingsLocale } = useTranslations();

  useEffect(() => {
    applySettingsLocale(null, null);
  }, [applySettingsLocale]);

  return null;
}

// F0.7 DoD: "switching the locale changes the displayed strings". jsdom's navigator defaults
// to "en-US", which since F1.6 is also the fallback locale — so a detection test pinned there
// would pass whether detection ran or not. Pinned to Polish instead: nothing but the browser
// can produce that.
describe('locale detection and switching', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'language', { value: 'pl-PL', configurable: true });
    Object.defineProperty(window.navigator, 'languages', {
      value: ['pl-PL'],
      configurable: true,
    });
  });

  it('overrides the default locale with the one detected from the browser', async () => {
    render(
      <LocaleProvider>
        <DemoText />
      </LocaleProvider>,
    );

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();
  });

  it('updates displayed strings when the user switches locale', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <LocaleSwitcher />
        <DemoText />
      </LocaleProvider>,
    );

    // Starts in Polish — detected from the browser via the mocked navigator above.
    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));

    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();
  });

  // F1.6: the choice used to live only in React state, so it lasted until the next reload —
  // including on the sign-in screen, where there are no server-side settings to restore it
  // from. A remount is what a reload looks like from here.
  it('remembers the chosen locale across a remount, over what the browser asks for', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <LocaleProvider>
        <SignedOut />
        <LocaleSwitcher />
        <DemoText />
      </LocaleProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }),
    );
    await user.click(await screen.findByText(localeLabels.ru));
    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();

    unmount();
    render(
      <LocaleProvider>
        <SignedOut />
        <DemoText />
      </LocaleProvider>,
    );

    // Synchronously after mount, with no `findBy` waiting on anything: the stored choice is
    // restored in a layout effect, which lands before the browser would paint the default.
    expect(screen.getByText(ru['home.demoTitle'])).toBeInTheDocument();
  });
});

// F1.6: `LocaleProvider` sits directly under `<body>` with no error boundary beneath it, so a
// throw in it is a blank app rather than a lost preference. Storage is not always reachable —
// Safari with "Block All Cookies" and a sandboxed iframe throw `SecurityError` on the property
// itself, and a private-mode write throws `QuotaExceededError`.
describe('when the browser refuses access to storage', () => {
  const owned = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'languages', { value: ['pl-PL'], configurable: true });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });

  afterEach(() => {
    if (owned) Object.defineProperty(window, 'localStorage', owned);
  });

  it('still detects a locale and still switches it, losing only the persistence', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <SignedOut />
        <LocaleSwitcher />
        <DemoText />
      </LocaleProvider>,
    );

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));

    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();
  });
});

// F0.7 DoD: "string substitutions" — `t()` substitutes `{{var}}` placeholders.
describe('interpolate', () => {
  it('substitutes variables into a template string', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Alice' })).toBe('Hello, Alice!');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hello, {{name}}!')).toBe('Hello, {{name}}!');
  });
});
