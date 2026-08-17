import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Metadata key written by {@link Public} and read by the guard — one constant, no drift. */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Opens a handler (or a whole controller) to anonymous requests.
 *
 * Everything is closed by default — `ClerkAuthGuard` is registered as `APP_GUARD` — so
 * being public is a decision written down at the endpoint. The inverse wiring (hang the
 * guard where you remember to) makes a new endpoint anonymous by omission, which is
 * exactly the mistake nobody notices in review.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
