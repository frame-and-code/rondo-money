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

const BEARER_PREFIX = 'Bearer ';

/** The `Authorization: Bearer <token>` value, or `undefined` for anything else. */
function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  return header.slice(BEARER_PREFIX.length).trim() || undefined;
}

/**
 * Verifies the Clerk session token on every request and puts the caller's `userId` on the
 * request. Registered globally (`AuthModule` → `APP_GUARD`), so an endpoint is protected
 * unless it says otherwise with `@Public()`.
 *
 * This is the first link of the isolation chain from ADR-005: with no row-level security
 * in Postgres, everything below trusts the `userId` this guard produced from a signature
 * it checked itself.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, before any configuration is touched: a public endpoint has to answer even on
    // an instance with no Clerk key at all — Railway's healthcheck is anonymous.
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

    // Outside the try below on purpose: a missing key is our misconfiguration, not the
    // caller's bad token, and dressing it up as a 401 would hide it in a login loop.
    const verifyOptions = resolveClerkVerifyOptions(this.config);

    let userId: string;
    try {
      const payload = await verifyToken(token, verifyOptions);
      // `sub` is the Clerk user id; verifyToken() has already asserted it is a string.
      userId = payload.sub;
    } catch (error) {
      // The reason (expired, bad signature, wrong issuer) is logged but never returned:
      // it tells whoever is forging tokens which part to fix next.
      this.logger.debug(
        `Rejected a session token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid session token');
    }

    request.auth = { userId };
    return true;
  }
}
