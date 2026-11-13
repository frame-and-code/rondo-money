import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { expectCardsInShape, signInWithMixedCards, snapshot, type CardShape } from './card-layout';
import { hasClerkKeys, TABLET_TEST_EMAIL } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test.use({ colorScheme: 'light' });

const TABLET_WIDTHS: { width: number; shape: CardShape }[] = [
  { width: 834, shape: { columns: 1, stacked: false, ringInPopover: true } },
  { width: 992, shape: { columns: 2, stacked: true, ringInPopover: true } },
  { width: 1100, shape: { columns: 2, stacked: true, ringInPopover: true } },
  { width: 1280, shape: { columns: 2, ringInPopover: true } },
  { width: 1344, shape: { columns: 3, stacked: true, ringInPopover: true } },
  { width: 1366, shape: { columns: 3, stacked: true, ringInPopover: true } },
  { width: 1440, shape: { columns: 3, stacked: true, ringInPopover: true } },
];

test('category cards keep their ring, rows and names in shape at tablet widths beside the open sidebar', async ({
  page,
}, testInfo) => {
  await signInWithMixedCards(page, TABLET_TEST_EMAIL);

  for (const { width, shape } of TABLET_WIDTHS) {
    await test.step(`at ${width} px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('button', { name: en['nav.toggleSidebar'] })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await snapshot(page, testInfo, `bills-at-${width}`);
      await expectCardsInShape(page, shape);
    });
  }
});
