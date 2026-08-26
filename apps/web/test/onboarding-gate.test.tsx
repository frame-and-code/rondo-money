import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';

import { OnboardingGate } from '@/components/onboarding-gate';
import { LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';
import type { OnboardingState } from '@/lib/onboarding';

import type { ReactElement } from 'react';

const replace = jest.fn();
const push = jest.fn();

const BUDGETS_KEY = ['budgetsControllerList'];
const ACCOUNTS_KEY = ['accountsControllerList'];

const CHILD = 'what the gate protects';
const WAITING = 'while the gate decides';

interface Budget {
  id: string;
  active: boolean;
}

let budgets: Budget[] = [];
let budgetsFail = false;
let budgetsGate: Promise<void> | null = null;
let budgetsAsked = 0;

let accounts: { id: string }[] = [];
let accountsFail = false;
let accountsAsked = 0;

let userId: string | null = 'user_a';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (href: string) => replace(href) as unknown,
    push: (href: string) => push(href) as unknown,
  }),
}));

jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: userId !== null, userId }),
}));

jest.mock('@rondo/api-client/react-query', () => ({
  budgetsControllerListOptions: () => ({
    queryKey: BUDGETS_KEY,
    queryFn: async () => {
      budgetsAsked += 1;
      if (budgetsGate !== null) await budgetsGate;
      if (budgetsFail) throw new Error('the api was unreachable');

      return budgets;
    },
  }),
  accountsControllerListOptions: () => ({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => {
      accountsAsked += 1;
      if (accountsFail) throw new Error('the api was unreachable');
      if (!budgets.some((budget) => budget.active)) {
        throw new Error('the caller has no active budget');
      }

      return accounts;
    },
  }),
}));

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const tree = (expects: OnboardingState, client: QueryClient): ReactElement => (
  <QueryClientProvider client={client}>
    <LocaleProvider>
      <OnboardingGate expects={expects} fallback={<p>{WAITING}</p>}>
        <p>{CHILD}</p>
      </OnboardingGate>
    </LocaleProvider>
  </QueryClientProvider>
);

const draw = (expects: OnboardingState, client: QueryClient = newClient()) => ({
  client,
  ...render(tree(expects, client)),
});

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  budgets = [];
  budgetsFail = false;
  budgetsGate = null;
  budgetsAsked = 0;
  accounts = [];
  accountsFail = false;
  accountsAsked = 0;
  userId = 'user_a';

  Object.defineProperty(window.navigator, 'languages', {
    value: ['ru-RU'],
    configurable: true,
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('the onboarding gate', () => {
  it('holds its children until this mount has an answer of its own', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];
    let open = () => {};
    budgetsGate = new Promise((resolve) => {
      open = resolve;
    });

    draw('app');

    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.getByText(WAITING)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    open();
    expect(await screen.findByText(CHILD)).toBeInTheDocument();
  });

  it('does not decide on an answer an earlier mount left in the cache', async () => {
    const client = newClient();
    client.setQueryData(BUDGETS_KEY, [{ id: 'budget-1', active: true }]);
    client.setQueryData(ACCOUNTS_KEY, [{ id: 'account-1' }]);

    budgets = [];
    let open = () => {};
    budgetsGate = new Promise((resolve) => {
      open = resolve;
    });

    draw('app', client);

    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    open();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('does not answer from a cache that nothing is refreshing', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(BUDGETS_KEY, []);
    client.setQueryData(ACCOUNTS_KEY, []);

    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];

    draw('app', client);
    await settle();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('sends a user with no budget out of the app to step 1', async () => {
    draw('app');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('sends a user with a budget and no accounts out of the app to step 2', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];

    draw('app');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new/account'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('lets a user who has both into the app', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];

    draw('app');

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('takes a user who finished setup off step 1, so a second budget is never offered', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];

    draw('budget');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/categories'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('resumes an interrupted setup at step 2 rather than at step 1', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];

    draw('budget');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new/account'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('refuses step 2 to a user who has no budget yet', async () => {
    draw('account');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('leaves step 1 standing when the budget it just created arrives', async () => {
    const { client } = draw('budget');
    await screen.findByText(CHILD);

    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];
    await act(async () => {
      await client.invalidateQueries({ queryKey: BUDGETS_KEY });
    });

    await waitFor(() => expect(accountsAsked).toBe(1));
    await waitFor(() => expect(client.getQueryData(ACCOUNTS_KEY)).toEqual([]));
    await settle();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it('leaves step 2 standing when the account it just created arrives', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];

    const { client } = draw('account');
    await screen.findByText(CHILD);

    accounts = [{ id: 'account-1' }];
    await act(async () => {
      await client.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    });

    await waitFor(() => expect(client.getQueryData(ACCOUNTS_KEY)).toEqual(accounts));
    await settle();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(CHILD)).toBeInTheDocument();
  });

  it('decides again when the user moves on from the step they just finished', async () => {
    const { client, rerender } = draw('budget');
    await screen.findByText(CHILD);

    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];
    await act(async () => {
      await client.invalidateQueries({ queryKey: BUDGETS_KEY });
    });
    await waitFor(() => expect(accountsAsked).toBe(1));

    rerender(tree('account', client));

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits for the read it just invalidated before deciding the next step', async () => {
    const { client, rerender } = draw('budget');
    await screen.findByText(CHILD);

    budgets = [{ id: 'budget-1', active: true }];
    accounts = [];
    let land = () => {};
    budgetsGate = new Promise((resolve) => {
      land = resolve;
    });
    void client.invalidateQueries({ queryKey: BUDGETS_KEY });
    await settle();

    rerender(tree('account', client));
    await settle();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();

    land();

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('decides again when another user signs in on the same tab', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];

    const { client, rerender } = draw('app');
    await screen.findByText(CHILD);

    userId = 'user_b';
    budgets = [];
    accounts = [];
    act(() => {
      client.clear();
    });
    rerender(tree('app', client));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('says the check failed rather than guessing when the budgets cannot be read', async () => {
    budgetsFail = true;

    draw('app');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['onboarding.unavailable']);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('says the check failed rather than guessing when the accounts cannot be read', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accountsFail = true;

    draw('app');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['onboarding.unavailable']);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('says the check failed when there is no network to make it with', async () => {
    onlineManager.setOnline(false);

    draw('app');

    expect(await screen.findByRole('alert')).toHaveTextContent(ru['onboarding.unavailable']);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps a user it already admitted when a later background read fails', async () => {
    budgets = [{ id: 'budget-1', active: true }];
    accounts = [{ id: 'account-1' }];

    const { client } = draw('app');
    await screen.findByText(CHILD);

    budgetsFail = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: BUDGETS_KEY });
    });

    await waitFor(() => expect(budgetsAsked).toBe(2));
    await settle();

    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not ask for accounts before there is an active budget to scope them to', async () => {
    draw('app');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(accountsAsked).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks nothing and shows nothing while nobody is signed in', async () => {
    userId = null;

    draw('app');
    await settle();

    expect(budgetsAsked).toBe(0);
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces the route rather than pushing it, so Back does not return to the gate', async () => {
    draw('app');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/new'));
    expect(push).not.toHaveBeenCalled();
  });
});
