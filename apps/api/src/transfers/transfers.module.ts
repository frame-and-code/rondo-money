import { Module } from '@nestjs/common';

import { MutationsModule } from '@/mutations/mutations.module';
import { TransfersController } from '@/transfers/transfers.controller';
import { TransfersService } from '@/transfers/transfers.service';

@Module({
  imports: [MutationsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
