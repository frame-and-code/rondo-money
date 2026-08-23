import { render, screen, waitFor } from '@testing-library/react';
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

function SignedOut() {
  const { applySettingsLocale } = useTranslations();

  useEffect(() => {
    applySettingsLocale(null, null);
  }, [applySettingsLocale]);

  return null;
}

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

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.ru));

    expect(await screen.findByText(ru['home.demoTitle'])).toBeInTheDocument();
  });

  it('closes the menu once a language is picked', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: pl['common.localeSwitcher.ariaLabel'] }),
    );
    await user.click(await screen.findByText(localeLabels.ru));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

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

    expect(screen.getByText(ru['home.demoTitle'])).toBeInTheDocument();
  });
});

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

describe('interpolate', () => {
  it('substitutes variables into a template string', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Alice' })).toBe('Hello, Alice!');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hello, {{name}}!')).toBe('Hello, {{name}}!');
  });
});
