import { expect, test, type Page } from '@playwright/test';

async function openWithoutTheApp(page: Page): Promise<void> {
  let refused = 0;
  await page.route('**/_next/static/chunks/**/*.js', (route) => {
    refused += 1;
    return route.abort();
  });
  await page.goto('/sign-in', { waitUntil: 'load' });

  expect(refused).toBeGreaterThan(0);
  await expect(page.locator('.cl-rootBox')).toHaveCount(0);
}

const backgrounds = (page: Page): Promise<{ shown: string; light: string }> =>
  page.evaluate(() => {
    const root = document.documentElement;
    const shown = getComputedStyle(document.body).backgroundColor;

    root.classList.remove('dark');
    const light = getComputedStyle(document.body).backgroundColor;
    root.classList.add('dark');

    return { shown, light };
  });

async function expectDarkBeforeTheApp(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  const { shown, light } = await backgrounds(page);
  expect(shown).not.toBe(light);
}

test.describe('a dark system', () => {
  test.use({ colorScheme: 'dark' });

  test('the first frame is dark before any of the app has loaded', async ({ page }) => {
    await openWithoutTheApp(page);
    await expectDarkBeforeTheApp(page);
  });
});

test.describe('a light system', () => {
  test.use({ colorScheme: 'light' });

  test('a dark theme picked earlier wins over the system before any of the app has loaded', async ({
    page,
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
    await openWithoutTheApp(page);
    await expectDarkBeforeTheApp(page);
  });

  test('with nothing picked the first frame follows the light system', async ({ page }) => {
    await openWithoutTheApp(page);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
