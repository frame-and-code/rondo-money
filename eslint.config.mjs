import base from '@rondo/config/eslint';
import tenantIsolation from '@rondo/config/eslint/tenant-isolation';

export default [...base, ...tenantIsolation({ prefix: 'apps/api/' })];
