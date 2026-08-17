import { RequestContextService } from '@/request-context/request-context.service';

/**
 * Unit level (F0.8): no Nest, no DB — the store on its own. What matters here is not that
 * a value can be written and read back, but that it cannot leak between requests and cannot
 * be absent unnoticed.
 */
describe('RequestContextService', () => {
  it('refuses to hand out a userId outside a request', () => {
    const context = new RequestContextService();

    // The alternative — returning undefined — is what turns a missing scope into an
    // unfiltered query further down (ADR-005).
    expect(() => context.requireUserId()).toThrow(/not scoped to a user/);
  });

  it('refuses to record a userId when no scope is open', () => {
    const context = new RequestContextService();

    expect(() => context.setUserId('user_a')).toThrow(/not mounted/);
  });

  it('refuses to hand out a userId inside a scope that has none', () => {
    const context = new RequestContextService();

    // A `@Public()` route: the middleware opened a scope, the guard never filled it.
    context.run(() => {
      expect(() => context.requireUserId()).toThrow(/not scoped to a user/);
    });
  });

  it('refuses to change the caller once the scope carries one', () => {
    const context = new RequestContextService();

    context.run(() => {
      context.setUserId('user_a');

      // Recording the same id twice is harmless; a *different* one would silently move the
      // rest of the request to another user's data, which is the whole thing being prevented.
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
        // Yield in the middle, so the two requests are genuinely interleaved: on a plain
        // field on this provider the slower one would come back with the other's id.
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return context.requireUserId();
      });

    const [slow, fast] = await Promise.all([handle('user_a', 20), handle('user_b', 0)]);

    expect([slow, fast]).toEqual(['user_a', 'user_b']);
  });
});
