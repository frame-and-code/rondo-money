// Root flat config — used when ESLint runs from the repo root (e.g. lint-staged in
// the pre-commit hook, which lints staged files by absolute path). Per-workspace runs
// (`turbo lint`) use each package's own eslint.config.mjs; all re-export the same base,
// so results are identical regardless of entry point.
import base from '@ffai/config/eslint';

export default base;
