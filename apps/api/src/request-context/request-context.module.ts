import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { RequestContextMiddleware } from '@/request-context/request-context.middleware';
import { RequestContextService } from '@/request-context/request-context.service';

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
