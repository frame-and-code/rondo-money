import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// F0.6 DoD: light/dark/system switching works and is SSR-safe (no FOUC via
// `suppressHydrationWarning` + next-themes' inline script, exercised in layout.tsx).
// Here we cover the actual toggle behaviour: picking a theme flips the `dark` class
// that Tailwind's `@custom-variant dark` selector relies on.
//
// Labels are passed as a prop (F0.7): `@rondo/ui` has no i18n mechanism of its own, so
// the consuming app supplies translated strings — here, fixed RU labels for the test.
const labels = {
  trigger: 'Переключить тему',
  light: 'Светлая',
  dark: 'Тёмная',
  system: 'Системная',
};

describe('theme toggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    // next-themes persists the picked theme under this key by default; without
    // clearing it, a value written by one test leaks into the next test's initial render.
    localStorage.removeItem('theme');
  });

  it('switches to dark theme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <ThemeToggle labels={labels} />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Переключить тему' }));
    await user.click(await screen.findByText('Тёмная'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('switches back to light theme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ThemeToggle labels={labels} />
      </ThemeProvider>,
    );
    document.documentElement.classList.add('dark');

    await user.click(screen.getByRole('button', { name: 'Переключить тему' }));
    await user.click(await screen.findByText('Светлая'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
