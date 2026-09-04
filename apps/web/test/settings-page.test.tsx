import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { render, screen } from '@testing-library/react';

import SettingsPage from '@/app/(app)/settings/page';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { ApiProvider } from '@/lib/api';

jest.mock('@clerk/nextjs', () => ({
  ...jest.requireActual('@clerk/nextjs'),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_a',
    getToken: () => Promise.resolve(null),
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { delete: () => Promise.resolve() },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  userSettingsControllerReadOptions: () => ({
    queryKey: ['userSettingsControllerRead'],
    queryFn: () => Promise.resolve({ language: 'en' }),
  }),
  userSettingsControllerReadQueryKey: () => ['userSettingsControllerRead'],
  userSettingsControllerUpdateMutation: () => ({
    mutationFn: () => Promise.resolve({ language: 'en' }),
  }),
  meControllerEraseMutation: () => ({
    mutationFn: () => Promise.resolve({ userId: 'user_a' }),
  }),
}));

describe('the settings page', () => {
  it('renders the language and the theme', async () => {
    render(
      <LocaleProvider>
        <ApiProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SettingsPage />
          </ThemeProvider>
        </ApiProvider>
      </LocaleProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: en['settings.language'] }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en['settings.theme'] })).toBeInTheDocument();
  });
});
