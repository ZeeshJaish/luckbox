/**
 * luckbox: randomness for games that you can replay.
 * The same seed gives the same results on every device, forever.
 *
 * @example
 * import { luck } from 'luckbox'
 * const rng = luck('my-seed')
 * rng.int(1, 6)
 *
 * @packageDocumentation
 */

export { luck } from './luck.ts'
export type { Luck, LuckOptions, DailyOptions } from './luck.ts'
export { Rng } from './rng.ts'
export type { RngState, JsonSeed } from './rng.ts'
export type { Seed } from './seed.ts'
export type { DayOptions } from './daily.ts'
export { ALGORITHMS } from './generators.ts'
export type { Algorithm } from './generators.ts'
export { WeightedTable } from './weighted.ts'
export type { Weights, WeightedEntries } from './weighted.ts'
export type { DiceRoll, DiceGroupRoll, Die, DiceOdds } from './dice.ts'
export { Bag, Deck } from './bag.ts'
export type { BagOptions, BagState, DeckOptions, DeckState } from './bag.ts'
export { FairChance } from './fair.ts'
export type { FairChanceOptions, FairChanceState } from './fair.ts'
export type { Point, ScatterOptions } from './geometry.ts'
export { LootTable, LootChest } from './loot.ts'
export type { LootSpec, FullLootSpec, LootDrop, LootAmount, LootOptions, SoftPity, LootState, Drop, LootSimulation, LootDropStats, SimulateOptions } from './loot.ts'
export { LuckboxError } from './errors.ts'
export type { LuckboxErrorCode } from './errors.ts'

/** The installed luckbox version. */
export const VERSION: string = '0.5.0'
