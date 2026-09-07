import { type RouteConflictPolicy } from '@nestjs/common';

export const ROUTE_CONFLICT_POLICY: RouteConflictPolicy = {
  duplicate: 'error',
  shadow: 'error',
};
