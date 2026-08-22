import { Prisma } from '@rondo/db';

export const SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.UserSettings,
]);
