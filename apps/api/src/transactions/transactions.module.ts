import { Module } from '@nestjs/common';

import { MutationsModule } from '@/mutations/mutations.module';
import { TransactionsController } from '@/transactions/transactions.controller';
import { TransactionsService } from '@/transactions/transactions.service';

@Module({
  imports: [MutationsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
