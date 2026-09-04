import { Module } from '@nestjs/common';

import { MeController } from '@/me/me.controller';
import { MeService } from '@/me/me.service';

@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
