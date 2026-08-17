import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { type AuthenticatedRequest } from '@/auth/authenticated-request';

/**
 * The verified `userId` of the current request, as a handler parameter.
 *
 * Handlers take identity from here and from nowhere else: a `userId` read out of the body,
 * the query or a header is a request to touch someone else's money, and with no RLS behind
 * us (ADR-005) nothing further down would catch it.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) {
      // Only reachable on a @Public() handler — the guard fills `auth` on every other
      // route. Throwing beats returning an empty id that a query would happily scope by.
      throw new UnauthorizedException('No verified user on this request');
    }

    return userId;
  },
);
