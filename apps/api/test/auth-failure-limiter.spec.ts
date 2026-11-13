import { Logger } from '@nestjs/common';

import { AuthFailureLimiter, type AuthFailureCounter } from '@/auth/auth-failure-limiter';

const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 5, 12, 0, 0);

class CountingStore implements AuthFailureCounter {
  readonly calls: string[] = [];
  private readonly hits = new Map<string, number>();
  failWith: Error | null = null;
  hold: Promise<void> | null = null;

  constructor(private readonly windowEnd: () => number) {}

  async record(clientKey: string): Promise<{ hits: number; windowEnd: Date }> {
    this.calls.push(clientKey);
    if (this.hold) {
      await this.hold;
    }
    if (this.failWith) {
      throw this.failWith;
    }
    const hits = (this.hits.get(clientKey) ?? 0) + 1;
    this.hits.set(clientKey, hits);

    return { hits, windowEnd: new Date(this.windowEnd()) };
  }
}

describe('the failed-authentication limiter', () => {
  let now: number;
  let store: CountingStore;
  let limiter: AuthFailureLimiter;

  beforeEach(() => {
    now = START;
    store = new CountingStore(() => START + MINUTE);
    limiter = new AuthFailureLimiter(store, { limit: 3, inFlight: 2 }, () => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets failures up to the limit through and blocks on the one past it', async () => {
    expect(await limiter.recordFailure('a')).toBeNull();
    expect(await limiter.recordFailure('a')).toBeNull();
    expect(await limiter.recordFailure('a')).toBeNull();
    expect(limiter.blockedUntil('a')).toBeNull();

    expect(await limiter.recordFailure('a')).toEqual(new Date(START + MINUTE));
    expect(limiter.blockedUntil('a')).toEqual(new Date(START + MINUTE));
  });

  it('blocks only the client that went over', async () => {
    for (let failure = 0; failure < 4; failure += 1) {
      await limiter.recordFailure('a');
    }

    expect(limiter.blockedUntil('b')).toBeNull();
  });

  it('lifts the block when the window ends', async () => {
    for (let failure = 0; failure < 4; failure += 1) {
      await limiter.recordFailure('a');
    }

    now = START + MINUTE - 1;
    expect(limiter.blockedUntil('a')).not.toBeNull();

    now = START + MINUTE;
    expect(limiter.blockedUntil('a')).toBeNull();
  });

  it('never asks the store about a client it already knows to be blocked', async () => {
    for (let failure = 0; failure < 4; failure += 1) {
      await limiter.recordFailure('a');
    }
    const asked = store.calls.length;

    expect(limiter.blockedUntil('a')).not.toBeNull();
    expect(store.calls).toHaveLength(asked);
  });

  it('answers as if under the limit, and says so in the log, when the store fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    store.failWith = new Error('connection refused');

    expect(await limiter.recordFailure('a')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
  });

  it('records no more failures at once than it is allowed, so the pool keeps room', async () => {
    let release: () => void = () => undefined;
    store.hold = new Promise((resolve) => {
      release = resolve;
    });

    const first = limiter.recordFailure('a');
    const second = limiter.recordFailure('b');
    expect(await limiter.recordFailure('c')).toBeNull();
    expect(store.calls).toEqual(['a', 'b']);

    release();
    await Promise.all([first, second]);
    await limiter.recordFailure('c');
    expect(store.calls).toEqual(['a', 'b', 'c']);
  });
});
