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

/**
 * The `Authorization: Bearer <token>` value, or `undefined` for anything else.
 *
 * The scheme is matched case-insensitively, as RFC 7235 §2.1 requires. Matching it
 * verbatim would answer a client sending `bearer` with a 401 indistinguishable from
 * sending no credentials at all — an afternoon of debugging for a header that is spelled
 * correctly.
 */
function extractBearerToken(header: string | undefined): string | undefined {
  if (header?.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) {
    return undefined;
  }

  return header.slice(BEARER_SCHEME.length).trim() || undefined;
}

/**
 * Verifies the Clerk session token on every request and publishes the caller's `userId` —
 * on the request, for handlers reading `@CurrentUserId()`, and into the request context,
 * where the Prisma extension and the raw-SQL repository pick it up. Registered globally
 * (`AuthModule` → `APP_GUARD`), so an endpoint is protected unless it says otherwise with
 * `@Public()`.
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
    private readonly context: RequestContextService,
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

    // Two consumers, one source. `request.auth` serves `@CurrentUserId()` in handlers; the
    // context serves everything that builds a query without being handed the caller —
    // the Prisma scoping extension and the raw-SQL repository (ADR-005).
    this.context.setUserId(userId);
    request.auth = { userId };
    return true;
  }
}
