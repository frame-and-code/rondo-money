import { Injectable, type NestMiddleware } from '@nestjs/common';

import { RequestContextService } from '@/request-context/request-context.service';

/**
 * Opens the request scope. Middleware, not a guard or an interceptor, because middleware is
 * the only layer that runs *before* guards: the scope has to exist by the time
 * `ClerkAuthGuard` has a `userId` to put into it.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware<unknown, unknown> {
  constructor(private readonly context: RequestContextService) {}

  use(_request: unknown, _response: unknown, next: () => void): void {
    this.context.run(next);
  }
}
