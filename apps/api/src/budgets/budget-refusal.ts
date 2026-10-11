import { BadRequestException } from '@nestjs/common';
import { type BudgetRefusal } from '@rondo/types';

const MESSAGES: Record<BudgetRefusal, string> = {
  UNKNOWN_BUDGET: 'The caller holds no such budget.',
};

export function refuseBudget(reason: BudgetRefusal): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
  });
}
