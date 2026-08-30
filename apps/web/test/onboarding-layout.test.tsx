import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import OnboardingLayout from '@/app/new/layout';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

let pathname = '/new';
let budgets: { id: string; active: boolean }[] | 'never answers' = 'never answers';
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: (href: string) => replace(href) as unknown, push: () => {} }),
}));

jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_a' }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: ['budgetsControllerList'],
    queryFn: () => (budgets === 'never answers' ? new Promise(() => {}) : Promise.resolve(budgets)),
  }),
  accountsControllerListOptions: () => ({
    queryKey: ['accountsControllerList'],
    queryFn: () => Promise.resolve({ accounts: [], total: '0' }),
  }),
}));

const draw = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LocaleProvider>
        <OnboardingLayout>
          <p>the step itself</p>
        </OnboardingLayout>
      </LocaleProvider>
    </QueryClientProvider>,
  );

describe('the layout over the onboarding steps', () => {
  beforeEach(() => {
    pathname = '/new';
    budgets = 'never answers';
    replace.mockClear();
    Object.defineProperty(window.navigator, 'languages', {
      value: ['ru-RU'],
      configurable: true,
    });
  });

  it('shows the step is coming rather than a blank page while the gate decides', () => {
    draw();

    expect(screen.getByRole('status', { name: ru['common.loading'] })).toBeInTheDocument();
    expect(screen.queryByText('the step itself')).not.toBeInTheDocument();
  });

  it('takes which step this is from the address, so the second one opens rather than spins', async () => {
    pathname = '/new/account';
    budgets = [{ id: 'budget-1', active: true }];

    draw();

    expect(await screen.findByText('the step itself')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
