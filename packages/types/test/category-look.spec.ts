import { CATEGORY_COLORS, CATEGORY_ICONS, isCategoryColor, isCategoryIcon } from '@rondo/types';

describe('the icon a category is drawn with', () => {
  it('recognises every name it lists', () => {
    for (const icon of CATEGORY_ICONS) {
      expect(isCategoryIcon(icon)).toBe(true);
    }
  });

  it('lists each name once', () => {
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
  });

  it('refuses a name the app cannot draw, whatever it looks like', () => {
    for (const value of ['Home', 'HOME', ' home', '', 'IconHome', null, undefined, 0, ['home']]) {
      expect(isCategoryIcon(value)).toBe(false);
    }
  });
});

describe('the colour a category is drawn in', () => {
  it('recognises every name it lists', () => {
    for (const color of CATEGORY_COLORS) {
      expect(isCategoryColor(color)).toBe(true);
    }
  });

  it('lists each name once', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it('refuses a value that is not one of the names, a raw colour included', () => {
    for (const value of ['#2f6feb', 'oklch(0.65 0.13 242)', 'Blue', '', null, undefined, 0]) {
      expect(isCategoryColor(value)).toBe(false);
    }
  });
});
