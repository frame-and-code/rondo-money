import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';
import { RequestContextService } from '@/request-context/request-context.service';

export interface RawQueryScope {
  userId: string;
}

@Injectable()
export class ScopedRawRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async query<T>(build: (scope: RawQueryScope) => Prisma.Sql): Promise<T[]> {
    return this.prisma.$queryRaw<T[]>(build(this.currentScope()));
  }

  async execute(build: (scope: RawQueryScope) => Prisma.Sql): Promise<number> {
    return this.prisma.$executeRaw(build(this.currentScope()));
  }

  private currentScope(): RawQueryScope {
    return { userId: this.context.requireUserId() };
  }
}
