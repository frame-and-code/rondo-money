import { Module } from '@nestjs/common';

import { MeController } from '@/me/me.controller';

@Module({
  controllers: [MeController],
})
export class MeModule {}
