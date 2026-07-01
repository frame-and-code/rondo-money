import { ThemeProvider } from '@ffai/ui/components/theme-provider';
import { ThemeToggle } from '@ffai/ui/components/theme-toggle';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// F0.6 DoD: light/dark/system switching works and is SSR-safe (no FOUC via
// `suppressHydrationWarning` + next-themes' inline script, exercised in layout.tsx).
// Here we cover the actual toggle behaviour: picking a theme flips the `dark` class
// that Tailwind's `@custom-variant dark` selector relies on.
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
        <ThemeToggle />
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
        <ThemeToggle />
      </ThemeProvider>,
    );
    document.documentElement.classList.add('dark');

    await user.click(screen.getByRole('button', { name: 'Переключить тему' }));
    await user.click(await screen.findByText('Светлая'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
