import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { type AuthenticatedRequest } from '@/auth/authenticated-request';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) {
      throw new UnauthorizedException('No verified user on this request');
    }

    return userId;
  },
);
