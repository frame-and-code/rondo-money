import { verifyToken } from '@clerk/backend';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { AuthFailureLimiter } from '@/auth/auth-failure-limiter';
import { type AuthenticatedRequest } from '@/auth/authenticated-request';
import { resolveClerkVerifyOptions } from '@/auth/clerk-verification';
import { clientKeyOf, type ClientSource } from '@/auth/client-key';
import { IS_PUBLIC_KEY } from '@/auth/public.decorator';
import { RequestContextService } from '@/request-context/request-context.service';

const BEARER_SCHEME = 'bearer ';
const MISSING_TOKEN = 'Missing bearer token';
const INVALID_TOKEN = 'Invalid session token';
const TOO_MANY_FAILURES = 'Too many failed authentication attempts';

interface HeaderSink {
  setHeader(name: string, value: string): unknown;
}

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
    private readonly limiter: AuthFailureLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest & ClientSource>();
    const token = extractBearerToken(request.headers.authorization);
    const userId = token === undefined ? undefined : await this.verify(token);

    if (userId === undefined) {
      return this.refuse(request, http.getResponse<HeaderSink>(), token);
    }

    this.context.setUserId(userId);
    request.auth = { userId };
    return true;
  }

  private async verify(token: string): Promise<string | undefined> {
    try {
      const payload = await verifyToken(token, resolveClerkVerifyOptions(this.config));
      return payload.sub;
    } catch (error) {
      this.logger.debug(
        `Rejected a session token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async refuse(
    request: ClientSource,
    response: HeaderSink,
    token: string | undefined,
  ): Promise<never> {
    const refusal = new UnauthorizedException(token === undefined ? MISSING_TOKEN : INVALID_TOKEN);
    const clientKey = clientKeyOf(request, this.config.get<string>('CLIENT_IP_HEADER'));
    if (clientKey === null) {
      throw refusal;
    }

    const blockedUntil =
      this.limiter.blockedUntil(clientKey) ?? (await this.limiter.recordFailure(clientKey));
    if (blockedUntil === null) {
      throw refusal;
    }

    const seconds = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
    response.setHeader('Retry-After', String(seconds));
    throw new HttpException(TOO_MANY_FAILURES, HttpStatus.TOO_MANY_REQUESTS);
  }
}
