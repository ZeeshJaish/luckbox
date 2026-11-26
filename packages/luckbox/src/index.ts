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
export { LuckboxError } from './errors.ts'
export type { LuckboxErrorCode } from './errors.ts'

/** The installed luckbox version. */
export const VERSION: string = '0.0.0'
