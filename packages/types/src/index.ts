/**
 * @rondo/types — shared DTOs and domain types for Rondo Money.
 *
 * Money is integer minor units in `bigint`, serialized as a string over the wire.
 * See {@link ./money}. Concrete DTOs are added alongside the features that introduce
 * them (see the development plan / PRD).
 */
export type { Money } from './money';
export { serializeMoney, parseMoney } from './money';
