import { verifyToken } from '@clerk/backend';
import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { type AuthenticatedRequest } from '@/auth/authenticated-request';
import { resolveClerkVerifyOptions } from '@/auth/clerk-verification';
import { IS_PUBLIC_KEY } from '@/auth/public.decorator';
import { RequestContextService } from '@/request-context/request-context.service';

const BEARER_SCHEME = 'bearer ';

function extractBearerToken(header: string | undefined): string | undefined {
  if (header?.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) {
    return undefined;
  }

  return header.slice(BEARER_SCHEME.length).trim() || undefined;
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const verifyOptions = resolveClerkVerifyOptions(this.config);

    let userId: string;
    try {
      const payload = await verifyToken(token, verifyOptions);
      userId = payload.sub;
    } catch (error) {
      this.logger.debug(
        `Rejected a session token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid session token');
    }

    this.context.setUserId(userId);
    request.auth = { userId };
    return true;
  }
}
