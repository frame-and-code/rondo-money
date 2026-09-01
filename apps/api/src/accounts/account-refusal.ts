import { BadRequestException } from '@nestjs/common';
import { type AccountRefusal } from '@rondo/types';

const MESSAGES: Record<AccountRefusal, string> = {
  ACCOUNT_ARCHIVED:
    'This account is archived. An archived account keeps its history and takes no change to ' +
    'it, and there is no way back.',
  BALANCE_NOT_ZERO:
    'This account still holds money, and archiving it would put that money where nobody can ' +
    'see it. Move what is left to another account first.',
  NO_ACTIVE_BUDGET:
    'The caller has no active budget, so there is nothing for an account to belong to. Create ' +
    'a budget first.',
  OPENING_FROZEN:
    'This account already holds records of its own, so what it opened with is settled. A ' +
    'balance that no longer matches the real one is corrected by recording the movements it ' +
    'is missing.',
  UNKNOWN_ACCOUNT: 'This budget holds no such account.',
};

export function refuseAccount(
  reason: AccountRefusal,
  extra: Record<string, unknown> = {},
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: MESSAGES[reason],
    reason,
    ...extra,
  });
}
