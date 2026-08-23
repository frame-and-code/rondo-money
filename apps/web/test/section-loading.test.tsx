import { render, screen } from '@testing-library/react';

import AccountsLoading from '@/app/(app)/accounts/loading';
import CategoriesLoading from '@/app/(app)/categories/loading';
import NetWorthLoading from '@/app/(app)/net-worth/loading';
import SettingsLoading from '@/app/(app)/settings/loading';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

const screens = [
  ['categories', CategoriesLoading],
  ['accounts', AccountsLoading],
  ['net worth', NetWorthLoading],
  ['settings', SettingsLoading],
] as const;

describe.each(screens)('the loading screen of %s', (_section, Loading) => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
    Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU'], configurable: true });
  });

  it('says it is loading and shows placeholders instead of an empty screen', async () => {
    render(
      <LocaleProvider>
        <Loading />
      </LocaleProvider>,
    );

    const status = await screen.findByRole('status', { name: ru['common.loading'] });

    expect(status).toBeInTheDocument();
    expect(status.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
