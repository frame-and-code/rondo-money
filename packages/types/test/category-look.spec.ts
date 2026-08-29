import { CATEGORY_COLORS, CATEGORY_ICONS, isCategoryColor, isCategoryIcon } from '@rondo/types';

describe('the icon a category is drawn with', () => {
  it('holds the fifty names the sets in the ticket settled on', () => {
    expect(CATEGORY_ICONS).toHaveLength(50);
  });

  it('names the five icons whose domain name is deliberately not the library name', () => {
    expect(CATEGORY_ICONS).toEqual(
      expect.arrayContaining(['phone', 'restaurant', 'tv', 'gamepad', 'laptop']),
    );
  });

  it('spells every name in lower kebab case, so nothing carries a component name', () => {
    for (const icon of CATEGORY_ICONS) {
      expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

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
  it('holds twenty four names, the ceiling the ticket argued for', () => {
    expect(CATEGORY_COLORS).toHaveLength(24);
  });

  it('carries the three muted names beside the chromatic ones', () => {
    expect(CATEGORY_COLORS).toEqual(expect.arrayContaining(['brown', 'graphite', 'gray']));
  });

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
