import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { interpolate, LocaleProvider, useTranslations } from '@/i18n/locale-context';
import { localeLabels } from '@/i18n/locales';
import { en } from '@/i18n/messages/en';
import { pl } from '@/i18n/messages/pl';

function DemoText() {
  const { t } = useTranslations();
  return <p>{t('home.demoTitle')}</p>;
}

// F0.7 DoD: "switching the locale changes the displayed strings" — pin jsdom's navigator (which
// defaults to "en-US") to English so the browser-detection effect has a known outcome
// to assert on, distinct from the hard-coded RU default.
describe('locale detection and switching', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    Object.defineProperty(window.navigator, 'languages', {
      value: ['en-US'],
      configurable: true,
    });
  });

  it('overrides the default locale with the one detected from the browser', async () => {
    render(
      <LocaleProvider>
        <DemoText />
      </LocaleProvider>,
    );

    expect(await screen.findByText(en['home.demoTitle'])).toBeInTheDocument();
  });

  it('updates displayed strings when the user switches locale', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <LocaleSwitcher />
        <DemoText />
      </LocaleProvider>,
    );

    // Starts in English — detected from the browser via the mocked navigator above.
    expect(await screen.findByText(en['home.demoTitle'])).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en['common.localeSwitcher.ariaLabel'] }));
    await user.click(await screen.findByText(localeLabels.pl));

    expect(await screen.findByText(pl['home.demoTitle'])).toBeInTheDocument();
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
