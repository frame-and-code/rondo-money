import { BadRequestException, type NotFoundException } from '@nestjs/common';
import { type BudgetRefusal } from '@rondo/types';

import { refuseMissing } from '@/openapi/not-found.response';

const MESSAGES: Record<BudgetRefusal, string> = {
  UNKNOWN_BUDGET: 'The caller holds no such budget.',
  TEMPLATE_WITH_DEFAULTS:
    'A budget started from another one takes its categories from there, so the starter set ' +
    'cannot be asked for with it.',
  NAME_TAKEN: 'The caller already has a budget under this name, whatever its case.',
};

export function refuseBudget(reason: BudgetRefusal): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
  });
}

export function refuseMissingBudget(): NotFoundException {
  return refuseMissing('UNKNOWN_BUDGET', MESSAGES.UNKNOWN_BUDGET);
}
