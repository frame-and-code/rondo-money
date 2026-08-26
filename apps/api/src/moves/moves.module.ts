import { Module } from '@nestjs/common';

import { MovesController } from '@/moves/moves.controller';
import { MovesService } from '@/moves/moves.service';

@Module({
  controllers: [MovesController],
  providers: [MovesService],
})
export class MovesModule {}
