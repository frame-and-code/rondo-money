import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

/** Metadata key written by {@link Public} and read by the guard — one constant, no drift. */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Vendor extension {@link Public} stamps on the operation, so the same decision reaches the
 * OpenAPI document: `buildOpenApiDocument` clears the global bearer requirement wherever it
 * finds this marker, and leaves it in the published spec as documentation.
 */
export const PUBLIC_OPERATION_EXTENSION = 'x-public';

/**
 * Opens a handler (or a whole controller) to anonymous requests.
 *
 * Everything is closed by default — `ClerkAuthGuard` is registered as `APP_GUARD` — so
 * being public is a decision written down at the endpoint. The inverse wiring (hang the
 * guard where you remember to) makes a new endpoint anonymous by omission, which is
 * exactly the mistake nobody notices in review.
 *
 * It carries the spec along with it for the same reason: a handler that is open in the code
 * but documented as requiring a token teaches clients the wrong contract, and one that is
 * closed in the code but documented as open invites a 401 nobody expected. Two decorators to
 * remember would eventually be one.
 */
export const Public = (): ReturnType<typeof applyDecorators> =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiExtension(PUBLIC_OPERATION_EXTENSION, true));
