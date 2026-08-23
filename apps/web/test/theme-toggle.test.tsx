import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const LABEL = 'Переключить тему';

function renderToggle(defaultTheme: 'light' | 'dark') {
  return render(
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem={false}>
      <ThemeToggle label={LABEL} />
    </ThemeProvider>,
  );
}

describe('theme toggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  });

  it('turns the dark theme on with a single click', async () => {
    const user = userEvent.setup();
    renderToggle('light');

    await user.click(screen.getByRole('button', { name: LABEL }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('turns it back off with the next click', async () => {
    const user = userEvent.setup();
    renderToggle('dark');

    await user.click(screen.getByRole('button', { name: LABEL }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('is one control, not a menu trigger', () => {
    renderToggle('light');

    expect(screen.getByRole('button', { name: LABEL })).not.toHaveAttribute('aria-haspopup');
  });
});
