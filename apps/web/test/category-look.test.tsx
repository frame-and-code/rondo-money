import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryColor,
  type CategoryIcon,
} from '@rondo/types';
import { render } from '@testing-library/react';
import { createElement } from 'react';

import { categoryLook } from '@/lib/category-look';

const drawn = (look: ReturnType<typeof categoryLook>): SVGElement | null => {
  const { container, unmount } = render(createElement(look.Icon));
  const svg = container.querySelector('svg');
  unmount();

  return svg;
};

describe('the look the screen draws a category with', () => {
  it('draws every name the API is allowed to answer with', () => {
    for (const icon of CATEGORY_ICONS) {
      expect(drawn(categoryLook(icon, null))).toBeInstanceOf(SVGElement);
    }

    for (const color of CATEGORY_COLORS) {
      expect(categoryLook(null, color).color).toEqual(expect.any(String));
    }
  });

  it('gives each name its own icon, so two categories do not share a symbol', () => {
    const drawn = CATEGORY_ICONS.map((icon) => categoryLook(icon, null).Icon);

    expect(new Set(drawn).size).toBe(CATEGORY_ICONS.length);
  });

  it('gives each name its own colour', () => {
    const drawn = CATEGORY_COLORS.map((color) => categoryLook(null, color).color);

    expect(new Set(drawn).size).toBe(CATEGORY_COLORS.length);
  });

  it('falls back on a name a newer API knows and this bundle does not, rather than crashing', () => {
    const later = 'cooking' as CategoryIcon;
    const shade = 'sand' as CategoryColor;
    const look = categoryLook(later, shade);
    const nothing = categoryLook(null, null);

    expect(drawn(look)).toBeInstanceOf(SVGElement);
    expect(look.Icon).toBe(nothing.Icon);
    expect(look.color).toBe(nothing.color);
  });

  it('draws a category nobody gave a look with something that says money', () => {
    const fallback = categoryLook(null, null);

    expect(drawn(fallback)).toBeInstanceOf(SVGElement);
    expect(fallback.color).toEqual(expect.any(String));
    expect(fallback.Icon).not.toBe(categoryLook('home', null).Icon);
  });
});
