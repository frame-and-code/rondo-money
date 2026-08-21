import { type withUserScoping } from '@/prisma/user-scoping.extension';

export const SCOPED_PRISMA = 'SCOPED_PRISMA';

export type ScopedPrismaClient = ReturnType<typeof withUserScoping>;
