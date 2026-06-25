// API lint = shared base + the opt-in type-aware layer (F0.2 carry-over): the API is
// where atomic state + ChangeLog mutations live, so no-floating-promises / no-misused-
// promises are enforced here.
import base from '@ffai/config/eslint';
import typeChecked from '@ffai/config/eslint/type-checked';

export default [...base, ...typeChecked(import.meta.dirname)];
