import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable } from 'rxjs';

import { type AuthenticatedRequest } from '@/auth/authenticated-request';
import { PrismaService } from '@/prisma/prisma.service';
import { RequestContextService } from '@/request-context/request-context.service';

@Injectable()
export class ActiveBudgetInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;

    if (userId) {
      const active = await this.prisma.budget.findUnique({
        where: { userId_active: { userId, active: true } },
        select: { id: true },
      });

      if (active) {
        this.context.setBudgetId(active.id);
      }
    }

    return next.handle();
  }
}
