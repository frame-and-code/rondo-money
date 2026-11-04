import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Locator } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { cardOf, readyToAssign } from './budget';
import { FRAMES_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test.use({ colorScheme: 'light' });

const VISIBLE_FRAME = 1.25;

const frameContrast = (frame: Locator): Promise<number> =>
  frame.evaluate((node) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The browser gave no canvas to measure a colour on');

    const paint = (colour: string): void => {
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
    };
    const luminance = (): number => {
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
      const linear = (channel: number): number => {
        const share = channel / 255;

        return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
      };

      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    };

    const style = getComputedStyle(node);
    const ring = style.boxShadow
      .split(/,(?![^(]*\))/u)
      .find((layer) => Number.parseFloat(layer.match(/-?[\d.]+px/gu)?.[3] ?? '0') > 0);
    const colour = ring?.replace(/-?[\d.]+px/gu, '').trim() ?? style.backgroundColor;

    const page = getComputedStyle(document.body).backgroundColor;
    paint(page);
    const behind = luminance();
    paint(colour);
    const drawn = luminance();

    return (Math.max(behind, drawn) + 0.05) / (Math.min(behind, drawn) + 0.05);
  });

test('the card whose menu is open stays above the blur, and the cards beside it go under', async ({
  page,
}) => {
  await recreateTestUser(FRAMES_TEST_EMAIL);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: FRAMES_TEST_EMAIL },
  });
  await onboard(page);

  const chosen = cardOf(page, 'Housing');
  const beside = cardOf(page, 'Utilities');
  await chosen.click();
  await expect(page.getByTestId('move-dialog')).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );

  const onTop = (card: typeof chosen): Promise<boolean> =>
    card.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + 8, box.top + 8);

      return hit !== null && node.contains(hit);
    });

  expect(await onTop(chosen)).toBe(true);
  expect(await onTop(beside)).toBe(false);
  await expect(page.locator('[data-slot="popover-backdrop"]')).toHaveCSS(
    'backdrop-filter',
    /blur/u,
  );
});

test('in the light theme a white card keeps a visible frame on the grey page, and the future month chip holds 3:1', async ({
  page,
}) => {
  await recreateTestUser(FRAMES_TEST_EMAIL);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: FRAMES_TEST_EMAIL },
  });
  await onboard(page);
  await expect(readyToAssign(page)).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  await expect(cardOf(page, 'Housing')).toBeVisible();
  const fills = await cardOf(page, 'Housing').evaluate((node) => ({
    card: getComputedStyle(node).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }));
  expect(fills.card).not.toBe(fills.page);
  const cardPixel = await cardOf(page, 'Housing').evaluate((node) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The browser gave no canvas to measure a colour on');

    context.fillStyle = getComputedStyle(node).backgroundColor;
    context.fillRect(0, 0, 1, 1);

    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(cardPixel).toEqual([255, 255, 255, 255]);
  expect(await frameContrast(cardOf(page, 'Housing'))).toBeGreaterThanOrEqual(VISIBLE_FRAME);
  expect(await frameContrast(page.getByTestId('month-header'))).toBeGreaterThanOrEqual(
    VISIBLE_FRAME,
  );
  expect(await frameContrast(page.getByTestId('group-rule').first())).toBeGreaterThanOrEqual(
    VISIBLE_FRAME,
  );

  await page.getByRole('button', { name: en['categories.nextMonth'] }).first().click();
  const chip = page.getByText(en['categories.futureMonth'], { exact: true });
  await expect(chip).toBeVisible();
  expect(await frameContrast(chip)).toBeGreaterThanOrEqual(3);
});
