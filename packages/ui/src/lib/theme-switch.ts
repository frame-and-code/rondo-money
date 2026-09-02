export const THEME_SWITCH_MS = 200;

export const THEME_SWITCH_CLASS = 'theme-switching';

let crossing: number | undefined;

export function switchTheme(apply: () => void): void {
  const root = document.documentElement;

  if (crossing !== undefined) {
    window.clearTimeout(crossing);
  }

  root.classList.add(THEME_SWITCH_CLASS);
  apply();
  crossing = window.setTimeout(() => {
    crossing = undefined;
    root.classList.remove(THEME_SWITCH_CLASS);
  }, THEME_SWITCH_MS);
}
