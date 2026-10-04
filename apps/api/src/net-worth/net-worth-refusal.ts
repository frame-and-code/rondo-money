import { BadRequestException } from '@nestjs/common';
import { type NetWorthRefusal } from '@rondo/types';

const MESSAGES: Record<NetWorthRefusal, string> = {
  DATE_IN_FUTURE:
    'The day is after today in the budget timezone. A valuation says what something was worth ' +
    'on a day that has already come.',
  NO_ACTIVE_BUDGET:
    'The caller has no active budget, so there is nothing for this to belong to. Create a ' +
    'budget first.',
  UNKNOWN_ASSET: 'This budget holds no such asset.',
  UNKNOWN_LIABILITY: 'This budget holds no such liability.',
};

export function refuseNetWorth(reason: NetWorthRefusal): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
  });
}
