import { Global, Module } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

/** Global, so every domain module can inject the same client. */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      // Built once at startup, not per request: the extension reads the caller from the
      // request context at query time, so one instance serves every request correctly.
      provide: SCOPED_PRISMA,
      inject: [PrismaService, RequestContextService],
      useFactory: (prisma: PrismaService, context: RequestContextService): ScopedPrismaClient =>
        withUserScoping(prisma, context),
    },
  ],
  exports: [PrismaService, SCOPED_PRISMA],
})
export class PrismaModule {}
