import { BadRequestException, type NotFoundException } from '@nestjs/common';
import { type CategoryRefusal } from '@rondo/types';

import { refuseMissing } from '@/openapi/not-found.response';

export const NO_ACTIVE_BUDGET =
  'The caller has no active budget, so there are no categories to change. Create a budget first.';

export function refuse(
  reason: CategoryRefusal,
  message: string,
  extra: Record<string, unknown> = {},
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message,
    reason,
    ...extra,
  });
}

export function missing(reason: CategoryRefusal, message: string): NotFoundException {
  return refuseMissing(reason, message);
}
