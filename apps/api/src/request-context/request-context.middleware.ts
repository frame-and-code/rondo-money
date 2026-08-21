import { Injectable, type NestMiddleware } from '@nestjs/common';

import { RequestContextService } from '@/request-context/request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware<unknown, unknown> {
  constructor(private readonly context: RequestContextService) {}

  use(_request: unknown, _response: unknown, next: () => void): void {
    this.context.run(next);
  }
}
