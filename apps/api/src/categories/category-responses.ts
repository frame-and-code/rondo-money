import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { CategoryRefusedResponse } from '@/categories/category-refused.response';
import { ConflictResponse } from '@/mutations/conflict.response';

export const REFUSED = {
  description:
    'The body was refused, or the change names something the caller cannot reach. A refusal ' +
    'from the domain carries the reason it was refused for.',
  type: CategoryRefusedResponse,
};

export const CLAIMED = {
  description: 'The idempotency key was claimed by a different request.',
  type: ConflictResponse,
};

export const ANONYMOUS = {
  description: 'The token was missing, malformed, expired or not minted for this app.',
  type: UnauthorizedResponse,
};
