// API lint = shared base + the opt-in type-aware layer (F0.2 carry-over): the API is
// where atomic state + ChangeLog mutations live, so no-floating-promises / no-misused-
// promises are enforced here.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import base from '@rondo/config/eslint';
import prismaRaw from '@rondo/config/eslint/prisma-raw';
import typeChecked from '@rondo/config/eslint/type-checked';
import unscopedPrisma from '@rondo/config/eslint/unscoped-prisma';

// `import.meta.dirname` needs Node >= 20.11; resolved manually so the config does not depend
// on the runtime's version (the workspace floor is Node 26 — see the root package.json).
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

// Two of the three ways round ADR-005 are closed here (the third, an unregistered model, is
// closed by test/scoped-models.spec.ts):
//   - raw SQL only in src/raw-sql, the one directory that scopes it by hand;
//   - the unscoped PrismaService only where it is legitimate — the module that provides it,
//     that same raw-SQL directory, and test fixtures that set up rows across users.
export default [
  ...base,
  ...typeChecked(tsconfigRootDir),
  ...prismaRaw({ allow: ['src/raw-sql/**/*.ts'] }),
  ...unscopedPrisma({ allow: ['src/prisma/**/*.ts', 'src/raw-sql/**/*.ts', 'test/**/*.ts'] }),
];
