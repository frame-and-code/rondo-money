import { Module } from '@nestjs/common';

import { BudgetsController } from '@/budgets/budgets.controller';
import { BudgetsService } from '@/budgets/budgets.service';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
