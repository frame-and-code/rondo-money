/// Long enough to read the line under the check, short enough that nobody waits for it. Both
/// onboarding steps confirm and then carry the user on themselves, so the pause is one fact
/// with one home: two copies would drift and the wizard would lose its rhythm.
export const CONFIRMATION_MS = 2200;
