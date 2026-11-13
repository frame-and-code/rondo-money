import { expect, type Locator, type Page } from '@playwright/test';

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrolling = Array.from(document.querySelectorAll('*')).filter((element) =>
          ['auto', 'scroll'].includes(getComputedStyle(element).overflowX),
        );
        const wide = [document.documentElement, ...scrolling].filter(
          (element) => element.scrollWidth - element.clientWidth > 1,
        );

        return wide.map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
      }),
    )
    .toEqual([]);
}

export async function expectOnScreen(page: Page, surface: Locator): Promise<void> {
  await expect(surface).toBeVisible();
  await expect
    .poll(async () => {
      const viewport = page.viewportSize();
      const box = await surface.boundingBox();
      if (!viewport || !box) return false;

      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height
      );
    })
    .toBe(true);
}
