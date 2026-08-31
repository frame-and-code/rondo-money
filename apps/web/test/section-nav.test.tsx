import { render, screen } from '@testing-library/react';

import { SectionNav } from '@/components/section-nav';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { ru } from '@/i18n/messages/ru';

let pathname = '/categories';

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

function speakBrowser(...languages: string[]) {
  Object.defineProperty(window.navigator, 'language', {
    value: languages[0],
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
}

function renderNav(props: { variant: 'sidebar' | 'tabs'; collapsed?: boolean }) {
  return render(
    <LocaleProvider>
      <SectionNav {...props} />
    </LocaleProvider>,
  );
}

describe('section navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname = '/categories';
    speakBrowser('ru-RU');
  });

  it('names its four sections in the language the browser asks for', async () => {
    renderNav({ variant: 'sidebar' });

    expect(await screen.findByRole('link', { name: ru['nav.categories'] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru['nav.accounts'] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru['nav.netWorth'] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru['nav.settings'] })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('follows the browser into another language instead of hardcoding one', async () => {
    speakBrowser('en-US');

    renderNav({ variant: 'sidebar' });

    expect(await screen.findByRole('link', { name: en['nav.accounts'] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['nav.settings'] })).toBeInTheDocument();
  });

  it('points each section at its own route', async () => {
    renderNav({ variant: 'sidebar' });

    expect(await screen.findByRole('link', { name: ru['nav.categories'] })).toHaveAttribute(
      'href',
      '/categories',
    );
    expect(screen.getByRole('link', { name: ru['nav.accounts'] })).toHaveAttribute(
      'href',
      '/accounts',
    );
    expect(screen.getByRole('link', { name: ru['nav.netWorth'] })).toHaveAttribute(
      'href',
      '/net-worth',
    );
    expect(screen.getByRole('link', { name: ru['nav.settings'] })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('marks the open section, and only it', async () => {
    pathname = '/accounts';

    renderNav({ variant: 'sidebar' });

    expect(await screen.findByRole('link', { name: ru['nav.accounts'] })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: ru['nav.categories'] })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });

  it('keeps the section marked on a path below it', async () => {
    pathname = '/categories/2026-08';

    renderNav({ variant: 'sidebar' });

    expect(await screen.findByRole('link', { name: ru['nav.categories'] })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('gives a collapsed item an accessible name in place of the visible label', async () => {
    renderNav({ variant: 'sidebar', collapsed: true });

    expect(await screen.findByRole('link', { name: ru['nav.accounts'] })).toBeInTheDocument();
    expect(screen.queryByText(ru['nav.accounts'])).not.toBeInTheDocument();
  });

  it('names a collapsed item when it takes keyboard focus', async () => {
    renderNav({ variant: 'sidebar', collapsed: true });

    const link = await screen.findByRole('link', { name: ru['nav.accounts'] });
    link.focus();

    expect(await screen.findByText(ru['nav.accounts'])).toBeInTheDocument();
  });

  it('carries the same four sections in the tab bar', async () => {
    renderNav({ variant: 'tabs' });

    expect(await screen.findByRole('link', { name: ru['nav.categories'] })).toHaveAttribute(
      'href',
      '/categories',
    );
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('centres a tab label, because one of them wraps onto a second line', async () => {
    renderNav({ variant: 'tabs' });

    const label = await screen.findByText(ru['nav.accounts']);

    expect(label.className).toContain('text-center');
  });
});
