import { Inject, Injectable, Logger } from '@nestjs/common';

export interface FailureCount {
  hits: number;
  windowEnd: Date;
}

export abstract class AuthFailureCounter {
  abstract record(clientKey: string): Promise<FailureCount>;
}

export interface AuthFailureLimits {
  limit: number;
  inFlight: number;
}

export const AUTH_FAILURE_LIMITS = Symbol('AUTH_FAILURE_LIMITS');
export const AUTH_FAILURE_CLOCK = Symbol('AUTH_FAILURE_CLOCK');

@Injectable()
export class AuthFailureLimiter {
  private readonly logger = new Logger(AuthFailureLimiter.name);
  private readonly blocked = new Map<string, number>();
  private recording = 0;

  constructor(
    private readonly counter: AuthFailureCounter,
    @Inject(AUTH_FAILURE_LIMITS) private readonly limits: AuthFailureLimits,
    @Inject(AUTH_FAILURE_CLOCK) private readonly clock: () => number,
  ) {}

  blockedUntil(clientKey: string): Date | null {
    const until = this.blocked.get(clientKey);
    if (until === undefined) {
      return null;
    }
    if (until <= this.clock()) {
      this.blocked.delete(clientKey);
      return null;
    }

    return new Date(until);
  }

  async recordFailure(clientKey: string): Promise<Date | null> {
    if (this.recording >= this.limits.inFlight) {
      return null;
    }

    this.recording += 1;
    try {
      const { hits, windowEnd } = await this.counter.record(clientKey);
      if (hits <= this.limits.limit) {
        return null;
      }
      this.block(clientKey, windowEnd.getTime());

      return windowEnd;
    } catch (error) {
      this.logger.warn(
        `Could not count a failed authentication, so it went unlimited: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    } finally {
      this.recording -= 1;
    }
  }

  private block(clientKey: string, until: number): void {
    const now = this.clock();
    for (const [key, end] of this.blocked) {
      if (end <= now) {
        this.blocked.delete(key);
      }
    }
    this.blocked.set(clientKey, until);
  }
}
