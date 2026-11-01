import { expect, type Locator, type Page } from '@playwright/test';

export async function tabTo(page: Page, target: Locator, limit = 80): Promise<void> {
  for (let press = 0; press < limit; press += 1) {
    if (await target.evaluate((node) => node === document.activeElement, null, { timeout: 5000 }))
      return;
    await page.keyboard.press('Tab');
  }

  throw new Error(`Tab did not reach ${target.toString()} in ${limit} presses`);
}

const showsFocus = (target: Locator): Promise<boolean> =>
  target.evaluate(async (node) => {
    if (!(node instanceof HTMLElement) || !node.matches(':focus-visible')) return false;

    const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 400));
    const seen = (element: Element): boolean => {
      const box = element.getBoundingClientRect();

      return (
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
        box.width > 2 &&
        box.height > 2
      );
    };

    await settle();
    const chain: Element[] = [];
    for (let at: Element | null = node; at && at !== document.body && chain.length < 5;) {
      if (seen(at)) chain.push(at);
      at = at.parentElement;
    }

    const look = (): Array<{ shadow: string; outline: string }> =>
      chain.map((element) => {
        const style = getComputedStyle(element);

        return {
          shadow: style.boxShadow,
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        };
      });
    const opaqueRing = (shadow: string): boolean =>
      shadow.split(/,(?![^(]*\))/u).some((layer) => {
        const spread = Number.parseFloat(layer.match(/-?[\d.]+px/gu)?.[3] ?? '0');
        const clear = /\/ 0\)|rgba\([^)]*,\s*0\)|transparent/u.test(layer);

        return spread > 0 && !clear;
      });
    const thickOutline = (outline: string): boolean => {
      const [style, width] = outline.split(' ');

      return style !== 'none' && style !== 'auto' && Number.parseFloat(width ?? '0') >= 2;
    };

    const focused = look();
    node.blur();
    await settle();
    const blurred = look();
    node.focus({ focusVisible: true });
    await settle();

    return focused.some((now, index) => {
      const before = blurred[index];
      if (!before) return false;

      return (
        (now.shadow !== before.shadow && opaqueRing(now.shadow)) ||
        (now.outline !== before.outline && thickOutline(now.outline))
      );
    });
  });

export async function expectVisibleFocus(target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  await expect.poll(() => showsFocus(target)).toBe(true);
}

export async function reach(page: Page, target: Locator): Promise<void> {
  await tabTo(page, target);
  await expectVisibleFocus(target);
}
