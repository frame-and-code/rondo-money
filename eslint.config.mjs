// Root flat config — used when ESLint runs from the repo root (e.g. lint-staged in
// the pre-commit hook, which lints staged files by absolute path). Per-workspace runs
// (`turbo lint`) use each package's own eslint.config.mjs.
//
// Both entry points install the same base and the same tenant-isolation rules (ADR-005), so a
// staged violation fails at the commit rather than only in CI; the allow-lists live in one
// place (`@rondo/config/eslint/tenant-isolation`) and differ here only by path prefix. What
// stays workspace-only is the type-aware layer, which needs each package's tsconfig.
import base from '@rondo/config/eslint';
import tenantIsolation from '@rondo/config/eslint/tenant-isolation';

export default [...base, ...tenantIsolation({ prefix: 'apps/api/' })];
