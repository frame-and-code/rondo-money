import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  AUTH_FAILURE_CLOCK,
  AUTH_FAILURE_LIMITS,
  AuthFailureCounter,
  AuthFailureLimiter,
  type AuthFailureLimits,
} from '@/auth/auth-failure-limiter';
import { ClerkAuthGuard } from '@/auth/auth.guard';
import { AuthFailureStore } from '@/raw-sql/auth-failure-store';

const LIMITS: AuthFailureLimits = { limit: 20, inFlight: 4 };

@Module({
  providers: [
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: AuthFailureCounter, useExisting: AuthFailureStore },
    { provide: AUTH_FAILURE_LIMITS, useValue: LIMITS },
    { provide: AUTH_FAILURE_CLOCK, useValue: () => Date.now() },
    AuthFailureLimiter,
  ],
})
export class AuthModule {}
