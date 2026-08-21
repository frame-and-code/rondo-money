import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import base from '@rondo/config/eslint';
import tenantIsolation from '@rondo/config/eslint/tenant-isolation';
import typeChecked from '@rondo/config/eslint/type-checked';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default [...base, ...typeChecked(tsconfigRootDir), ...tenantIsolation()];
