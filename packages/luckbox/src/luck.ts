import { type DayOptions, dayKey, weekKey } from './daily.ts'
import { type DiceOdds, diceOdds } from './dice.ts'
import { LuckboxError, show } from './errors.ts'
import { type Algorithm, STATE_SIZE, checkAlgorithm, createGenerator, generatorFromKey } from './generators.ts'
import { type RngState, Rng } from './rng.ts'
import { type Seed, type Words4, freshSeed, seedBytes, seedKey } from './seed.ts'
import { type WeightedEntries, type WeightedTable, type Weights, readWeights } from './weighted.ts'

/** Options for `luck()`. */
export interface LuckOptions {
  /** The generator to use. Default: `'sfc32'`. */
  algorithm?: Algorithm
}

/** Options for `luck.daily()` and `luck.weekly()`. */
export interface DailyOptions extends DayOptions {
  /**
   * Your game's name, so your daily level differs from every other game's
   * that also uses luckbox. Default: none.
   */
  salt?: string
  /** The generator to use. Default: `'sfc32'`. */
  algorithm?: Algorithm
}

/** The `luck` function and its helpers. */
export interface Luck {
  /**
   * A seeded random number generator.
   * With no seed it picks a fresh one; read it back from `rng.seed` to replay the run.
   * @example
   * const rng = luck('my-seed')
   * rng.int(1, 6) // same result every time for this seed
   * @example
   * const run = luck()
   * showSeedOnScreen(run.seed) // 'k3f9x2pqm7'
   */
  (seed?: Seed, options?: LuckOptions): Rng
  /**
   * Continues an Rng from a saved `rng.state()` (the object, or its JSON text).
   * @example const rng = luck.from(save.rng)
   */
  from(state: RngState | string): Rng
  /**
   * An Rng that is the same for every player today: daily levels, daily deals, daily puzzles.
   * Its seed is `'daily:YYYY-MM-DD'` (or `'<salt>:daily:YYYY-MM-DD'`), so `luck(seed)`
   * replays any past day.
   * @example const today = luck.daily({ salt: 'my-game' })
   */
  daily(options?: DailyOptions): Rng
  /**
   * An Rng that is the same for every player this week (ISO weeks, starting Monday).
   * Its seed is `'weekly:YYYY-Www'` (or `'<salt>:weekly:YYYY-Www'`).
   * @example const thisWeek = luck.weekly({ salt: 'my-game' })
   */
  weekly(options?: DailyOptions): Rng
  /**
   * The exact chance of every total a dice notation can roll, worked out
   * with maths (not by rolling), plus min, max and average.
   * @example
   * const odds = luck.odds('2d6')
   * odds.chance(7)    // 0.1667 (6 in 36)
   * odds.atLeast(10)  // 0.1667
   * odds.mean         // 7
   */
  odds(notation: string): DiceOdds
  /**
   * A weighted table ready for fast, repeated picks with `table.pick(rng)`.
   * Exact for whole-number weights.
   * @example
   * const drops = luck.weights({ gold: 70, gem: 25, crown: 5 })
   * drops.pick(rng) // 'gold'
   */
  weights<K extends string>(weights: Weights<K>): WeightedTable<K>
  weights<T>(entries: WeightedEntries<T>): WeightedTable<T>
  weights<T>(items: ArrayLike<T>, weightOf: (item: T, index: number) => number): WeightedTable<T>
  /** Today's date as `'YYYY-MM-DD'`. */
  dayKey(options?: DayOptions): string
  /** This week as `'YYYY-Www'`. */
  weekKey(options?: DayOptions): string
}

function readOptions(options: LuckOptions | undefined): Algorithm {
  if (options === undefined) return 'sfc32'
  if (options === null || typeof options !== 'object') {
    throw new LuckboxError('BAD_ARGUMENT', `options must be an object like { algorithm: 'sfc32' }, got ${show(options)}.`)
  }
  return options.algorithm === undefined ? 'sfc32' : checkAlgorithm(options.algorithm)
}

function create(seed: Seed | undefined, options?: LuckOptions): Rng {
  const algorithm = readOptions(options)
  const finalSeed = seed === undefined ? freshSeed() : seed
  const key = seedKey(finalSeed)
  return new Rng({ algorithm, key, generator: generatorFromKey(algorithm, key), draws: 0, seed: finalSeed })
}

function isUint32(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff
}

function bad(why: string): never {
  throw new LuckboxError('BAD_STATE', `this saved state can't be loaded: ${why}. Pass what rng.state() returned.`)
}

function from(state: RngState | string): Rng {
  let s: unknown = state
  if (typeof state === 'string') {
    try {
      s = JSON.parse(state)
    } catch {
      bad('the text is not valid JSON')
    }
  }
  if (s === null || typeof s !== 'object') bad(`expected an object, got ${show(s)}`)
  const o = s as Partial<Record<keyof RngState, unknown>>
  if (o.version !== 1) bad(`unknown version ${show(o.version)} (this luckbox reads version 1)`)
  let algorithm: Algorithm
  try {
    algorithm = checkAlgorithm(o.algorithm)
  } catch {
    bad(`unknown algorithm ${show(o.algorithm)}`)
  }
  const { key, words, draws, seed } = o
  if (!Array.isArray(key) || key.length !== 4 || !key.every(isUint32)) bad('"key" must be 4 whole numbers')
  const size = STATE_SIZE[algorithm]
  if (!Array.isArray(words) || words.length !== size || !words.every(isUint32)) {
    bad(`"words" must be ${size} whole number${size === 1 ? '' : 's'} for ${algorithm}`)
  }
  if (algorithm === 'xoshiro128**' && words.every((w) => w === 0)) bad('"words" are all zero')
  if (typeof draws !== 'number' || !Number.isSafeInteger(draws) || draws < 0) bad('"draws" must be a whole number')
  if (seed !== undefined) {
    try {
      seedBytes(seed as Seed)
    } catch {
      bad('"seed" is not a valid seed')
    }
  }
  const generator = createGenerator(algorithm)
  generator.load(words as number[])
  return new Rng({ algorithm, key: [...key] as Words4, generator, draws, seed: seed as Seed | undefined })
}

function periodic(kind: 'daily' | 'weekly', options: DailyOptions | undefined): Rng {
  const salt = options?.salt
  if (salt !== undefined && typeof salt !== 'string') {
    throw new LuckboxError('BAD_ARGUMENT', `salt must be text like 'my-game', got ${show(salt)}.`)
  }
  const when = kind === 'daily' ? dayKey(options) : weekKey(options)
  const seed = `${salt ? `${salt}:` : ''}${kind}:${when}`
  return create(seed, options?.algorithm === undefined ? undefined : { algorithm: options.algorithm })
}

/**
 * Makes a seeded random number generator.
 *
 * @example
 * import { luck } from 'luckbox'
 *
 * const rng = luck('my-seed')
 * rng.int(1, 6)                        // a die roll, the same every time for this seed
 * rng.pick(['sword', 'bow', 'staff'])
 * const saved = rng.state()            // continue later with luck.from(saved)
 * const today = luck.daily()           // the same for every player today
 */
export const luck: Luck = Object.assign(
  (seed?: Seed, options?: LuckOptions): Rng => create(seed, options),
  {
    from,
    daily: (options?: DailyOptions): Rng => periodic('daily', options),
    weekly: (options?: DailyOptions): Rng => periodic('weekly', options),
    odds: diceOdds,
    weights: (input: unknown, weightOf?: (item: never, index: number) => number): WeightedTable<unknown> =>
      readWeights(input, weightOf as ((item: unknown, index: number) => number) | undefined, 'weights()'),
    dayKey,
    weekKey,
  },
) as Luck
