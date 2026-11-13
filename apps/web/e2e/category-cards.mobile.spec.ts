import { test } from '@playwright/test';

import { expectCardsInShape, signInWithMixedCards, snapshot } from './card-layout';
import { hasClerkKeys, PHONE_CARDS_TEST_EMAIL } from './clerk';
import { expectNoSidewaysScroll } from './phone';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test.use({ colorScheme: 'light' });

test('on a phone every category card lays its rows out alike and keeps a long name off the amount', async ({
  page,
}, testInfo) => {
  await signInWithMixedCards(page, PHONE_CARDS_TEST_EMAIL);

  await snapshot(page, testInfo, 'bills-on-a-phone');
  await expectCardsInShape(page, { columns: 1, stacked: true, ringInPopover: false });
  await expectNoSidewaysScroll(page);
});
