import { ValidationPipe } from '@nestjs/common';

/**
 * The single validating pipe for the whole API, registered globally as `APP_PIPE` in
 * [`app.module.ts`](../app.module.ts).
 *
 * `class-validator` + `class-transformer` rather than zod, decided with the ticket: the
 * response classes already carry `@ApiProperty`, so a request DTO validated by decorators is
 * the same metadata model rather than a second one living beside it.
 *
 * Exported as a value, not built at the registration site, so tests can drive the exact pipe
 * production runs instead of a copy configured to look like it.
 */
export const VALIDATION_PIPE = new ValidationPipe({
  // Strip anything the DTO did not declare, then refuse the request for having sent it. The
  // security rule asks for both halves: unexpected fields are rejected, not quietly dropped,
  // so a typo'd field name fails instead of being ignored while the request "succeeds".
  whitelist: true,
  forbidNonWhitelisted: true,
  // Hand the handler a real DTO instance rather than a bare object literal.
  transform: true,
  transformOptions: {
    // Deliberately off. Implicit conversion coerces by the property's declared type, which
    // would turn a JSON number into the string a money field expects — and precision has
    // already been lost by then, silently, which is the entire reason money never travels as a
    // number. Let it fail at the validator instead.
    enableImplicitConversion: false,
  },
});
