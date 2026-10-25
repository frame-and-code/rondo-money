import { enUS } from '@clerk/localizations/en-US';
import { plPL } from '@clerk/localizations/pl-PL';
import { ruRU } from '@clerk/localizations/ru-RU';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { localeLabels, type Locale } from '../src/i18n/locales';
import { messages } from '../src/i18n/messages';
import { APP_NAME, sections } from '../src/lib/sections';

import {
  hasClerkKeys,
  I18N_EN_TEST_EMAIL,
  I18N_PL_TEST_EMAIL,
  I18N_RU_TEST_EMAIL,
  recreateTestUser,
} from './clerk';
import { APP_ENTRY, onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const LANGUAGES: ReadonlyArray<{
  locale: Locale;
  browser: string;
  email: string;
  signInButton: string | undefined;
  freeMoney: string;
}> = [
  {
    locale: 'ru',
    browser: 'ru-RU',
    email: I18N_RU_TEST_EMAIL,
    signInButton: ruRU.formButtonPrimary,
    freeMoney: '1 000 $',
  },
  {
    locale: 'en',
    browser: 'en-US',
    email: I18N_EN_TEST_EMAIL,
    signInButton: enUS.formButtonPrimary,
    freeMoney: '$1,000',
  },
  {
    locale: 'pl',
    browser: 'pl-PL',
    email: I18N_PL_TEST_EMAIL,
    signInButton: plPL.formButtonPrimary,
    freeMoney: '1000 $',
  },
];

const CYRILLIC = /\p{Script=Cyrillic}/u;

function foreignPhrases(locale: Locale): string[] {
  const own = new Set(Object.values(messages[locale]));

  return Object.values(messages)
    .filter((words) => words !== messages[locale])
    .flatMap((words) => Object.values(words))
    .filter((phrase) => phrase.length > 12 && !phrase.includes('{{') && !own.has(phrase));
}

async function speaksOnly(page: Page, locale: Locale): Promise<void> {
  const text = (await page.locator('body').innerText()).replaceAll(localeLabels.ru, '');

  expect(text).not.toContain('{{');
  if (locale !== 'ru') {
    expect(text).not.toMatch(CYRILLIC);
  }
  for (const phrase of foreignPhrases(locale)) {
    expect(text, `a phrase of another language: ${phrase}`).not.toContain(phrase);
  }
}

for (const language of LANGUAGES) {
  test(`the app speaks ${language.locale} from sign-in to every section`, async ({ browser }) => {
    const words = messages[language.locale];
    await recreateTestUser(language.email);

    const context = await browser.newContext({ locale: language.browser });
    const page = await context.newPage();
    await setupClerkTestingToken({ page });

    await page.goto('/sign-in');
    await expect(
      page.getByRole('button', { name: language.signInButton, exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', language.locale);

    await clerk.signIn({
      page,
      signInParams: { strategy: 'email_code', identifier: language.email },
    });
    await page.goto(APP_ENTRY);
    await expect(page.getByRole('heading', { name: words['newBudget.heading'] })).toBeVisible();
    await speaksOnly(page, language.locale);
    await onboard(page, words);

    await expect(page.getByTestId('ready-to-assign')).toHaveText(language.freeMoney);

    for (const section of sections) {
      await page.goto(section.href);
      await expect(page).toHaveTitle(`${words[section.labelKey]} - ${APP_NAME}`);
      await expect(page.locator('html')).toHaveAttribute('lang', language.locale);
      await page.waitForLoadState('networkidle');
      await speaksOnly(page, language.locale);
    }

    await context.close();
  });
}
