import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ClerkAuthGuard } from '@/auth/auth.guard';

/**
 * Puts `ClerkAuthGuard` in front of every controller in the application (`APP_GUARD`).
 * Importing this module is the whole wiring — endpoints opt out of it one at a time with
 * `@Public()`, and a new endpoint is protected without anyone remembering to protect it.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ClerkAuthGuard }],
})
export class AuthModule {}
