import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppShell } from '@/components/app-shell';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

let pathname = '/categories';

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

jest.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

function speakRussian() {
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
}

function renderShell() {
  return render(
    <LocaleProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <AppShell>
          <p>section content</p>
        </AppShell>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe('application shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname = '/categories';
    speakRussian();
  });

  it('heads the page with the open section and keeps the account controls in reach', async () => {
    renderShell();

    expect(
      await screen.findByRole('heading', { level: 1, name: ru['nav.categories'] }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ru['common.localeSwitcher.ariaLabel'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ru['common.themeToggle.trigger'] }),
    ).toBeInTheDocument();
  });

  it('renames the collapse control and drops the wordmark once the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(await screen.findByText('Rondo Money')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: ru['nav.toggleSidebar'] }));

    expect(screen.getByRole('button', { name: ru['nav.expandSidebar'] })).toBeInTheDocument();
    expect(screen.queryByText('Rondo Money')).not.toBeInTheDocument();
  });

  it('carries the section navigation on both surfaces', async () => {
    renderShell();

    expect(await screen.findAllByRole('navigation')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: ru['nav.accounts'] })).toHaveLength(2);
  });

  it('renames the heading when another section is open', async () => {
    pathname = '/net-worth';

    renderShell();

    expect(
      await screen.findByRole('heading', { level: 1, name: ru['nav.netWorth'] }),
    ).toBeInTheDocument();
  });

  it('renders the section below the header', () => {
    renderShell();

    expect(screen.getByText('section content')).toBeInTheDocument();
  });
});
