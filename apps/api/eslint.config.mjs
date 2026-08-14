// API lint = shared base + the opt-in type-aware layer (F0.2 carry-over): the API is
// where atomic state + ChangeLog mutations live, so no-floating-promises / no-misused-
// promises are enforced here.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import base from '@rondo/config/eslint';
import typeChecked from '@rondo/config/eslint/type-checked';

// `import.meta.dirname` only exists on Node >= 20.11; resolve it manually for the >=20 floor.
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default [...base, ...typeChecked(tsconfigRootDir)];
