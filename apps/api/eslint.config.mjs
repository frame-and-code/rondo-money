// API lint = shared base + the opt-in type-aware layer (F0.2 carry-over): the API is
// where atomic money mutations live, so no-floating-promises / no-misused-promises are
// enforced here.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import base from '@rondo/config/eslint';
import tenantIsolation from '@rondo/config/eslint/tenant-isolation';
import typeChecked from '@rondo/config/eslint/type-checked';

// `import.meta.dirname` needs Node >= 20.11; resolved manually so the config does not depend
// on the runtime's version (the workspace floor is Node 26 — see the root package.json).
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

// Two of the three ways round ADR-005 are closed by `tenantIsolation` (raw SQL outside
// src/raw-sql, and the unscoped PrismaService outside the places that may hold it); the third,
// an unregistered model, is closed by test/scoped-models.spec.ts. The same rules are installed
// in the root config, so the pre-commit hook catches them too.
export default [...base, ...typeChecked(tsconfigRootDir), ...tenantIsolation()];
