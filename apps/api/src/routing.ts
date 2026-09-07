import { type NestApplicationOptions } from '@nestjs/common';

export const ROUTING_OPTIONS: Pick<
  NestApplicationOptions,
  'routeConflictPolicy' | 'routeResolutionStrategy'
> = {
  routeConflictPolicy: { duplicate: 'error' },
  routeResolutionStrategy: 'specificity',
};
