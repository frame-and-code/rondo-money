import RootPage from '@/app/page';

const redirect = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (href: string) => redirect(href) as unknown,
}));

describe('the / route', () => {
  it('hands the visitor to the app, where the gate decides which step they are on', () => {
    RootPage();

    expect(redirect).toHaveBeenCalledWith('/categories');
  });
});
