import { Prisma } from '@rondo/db';

/**
 * The models whose every query is filtered by the caller's `userId`.
 *
 * One explicit place, and the only one. A model that carries user data joins this set **in
 * the same change that creates it** (ADR-005) — never "in a follow-up", because between the
 * two commits the model is readable by anyone.
 *
 * Remembering is not left to anyone's memory:
 *
 * - `test/scoped-models.spec.ts` fails when a model has a `userId` column and is missing
 *   here — that is the guarantee, and it runs in the CI gate;
 * - `.claude/hooks/stop-scoping-drift.sh` says so before the commit — that is a reminder,
 *   and it only fires inside a Claude Code session.
 */
export const SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.UserSettings,
]);
