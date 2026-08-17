import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { RequestContextMiddleware } from '@/request-context/request-context.middleware';
import { RequestContextService } from '@/request-context/request-context.service';

/**
 * Global, because the context is read from three unrelated places — the auth guard, the
 * Prisma scoping extension and the raw-SQL repository — and none of them should have to
 * import a module to learn who is calling.
 *
 * The module mounts its own middleware, so importing it is the whole wiring (the same stance
 * as `AuthModule`), and every request gets a scope whether it was booted from `main.ts` or
 * from `Test.createTestingModule()` in a spec.
 */
@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // `'{*splat}'` and not `'*'`: Express 5 parses paths with path-to-regexp v8, where a
    // bare `*` throws ("Missing parameter name") and `'*splat'` matches every path except
    // the root. The braces make the wildcard optional, so `/` is covered too.
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
