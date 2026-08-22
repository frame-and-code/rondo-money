import { RequestContextService } from '@/request-context/request-context.service';

describe('RequestContextService', () => {
  it('refuses to hand out a userId outside a request', () => {
    const context = new RequestContextService();

    expect(() => context.requireUserId()).toThrow(/not scoped to a user/);
  });

  it('refuses to record a userId when no scope is open', () => {
    const context = new RequestContextService();

    expect(() => context.setUserId('user_a')).toThrow(/not mounted/);
  });

  it('refuses to hand out a userId inside a scope that has none', () => {
    const context = new RequestContextService();

    context.run(() => {
      expect(() => context.requireUserId()).toThrow(/not scoped to a user/);
    });
  });

  it('refuses to change the caller once the scope carries one', () => {
    const context = new RequestContextService();

    context.run(() => {
      context.setUserId('user_a');

      expect(() => context.setUserId('user_a')).not.toThrow();
      expect(() => context.setUserId('user_b')).toThrow(/already carries a different userId/);
      expect(context.requireUserId()).toBe('user_a');
    });
  });

  it('keeps two requests in flight apart', async () => {
    const context = new RequestContextService();

    const handle = (userId: string, delayMs: number): Promise<string> =>
      context.run(async () => {
        context.setUserId(userId);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return context.requireUserId();
      });

    const [slow, fast] = await Promise.all([handle('user_a', 20), handle('user_b', 0)]);

    expect([slow, fast]).toEqual(['user_a', 'user_b']);
  });
});
