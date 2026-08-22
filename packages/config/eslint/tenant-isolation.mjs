import prismaRaw from './prisma-raw.mjs';
import unscopedPrisma from './unscoped-prisma.mjs';

export default function tenantIsolation({ prefix = '' } = {}) {
  return [
    ...prismaRaw({ allow: [`${prefix}src/raw-sql/**/*.ts`] }),
    ...unscopedPrisma({
      allow: [
        `${prefix}src/prisma/**/*.ts`,
        `${prefix}src/raw-sql/**/*.ts`,
        `${prefix}test/**/*.ts`,
      ],
    }),
  ];
}
