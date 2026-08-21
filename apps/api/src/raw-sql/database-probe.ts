import { Injectable } from '@nestjs/common';
import { Prisma } from '@rondo/db';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DatabaseProbe {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
  }
}
