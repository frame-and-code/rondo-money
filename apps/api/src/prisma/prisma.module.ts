import { Global, Module } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

/** Global, so every domain module can inject the same PrismaService. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
