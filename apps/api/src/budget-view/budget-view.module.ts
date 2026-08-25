import { Module } from '@nestjs/common';

import { BudgetViewController } from '@/budget-view/budget-view.controller';
import { BudgetViewService } from '@/budget-view/budget-view.service';

@Module({
  controllers: [BudgetViewController],
  providers: [BudgetViewService],
})
export class BudgetViewModule {}
