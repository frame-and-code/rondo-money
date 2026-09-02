export const THEME_SWITCH_MS = 200;

export const THEME_SWITCH_CLASS = 'theme-switching';

export function switchTheme(apply: () => void): void {
  if (typeof document === 'undefined') {
    apply();
    return;
  }

  const root = document.documentElement;

  root.classList.add(THEME_SWITCH_CLASS);
  apply();
  window.setTimeout(() => root.classList.remove(THEME_SWITCH_CLASS), THEME_SWITCH_MS);
}
