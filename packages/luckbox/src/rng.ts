import { LuckboxError, show } from './errors.ts'
import { type Algorithm, type Generator, createGenerator, generatorFromKey } from './generators.ts'
import { READABLE_ALPHABET, type Seed, type Words4, forkKey } from './seed.ts'

/** A seed as it can be stored in JSON (bigints become text, which seeds the same). */
export type JsonSeed = string | number | JsonSeed[]

/**
 * Everything needed to continue an Rng exactly where it was.
 * Plain JSON: put it in a save file, send it over the network, store it anywhere.
 */
export interface RngState {
  /** Format version of this object. */
  version: 1
  /** Which generator made the numbers. */
  algorithm: Algorithm
  /** The seed's 128-bit key, used by `fork()`. */
  key: number[]
  /** The generator's current position. */
  words: number[]
  /** How many 32-bit numbers have been drawn so far. */
  draws: number
  /** The original seed, if there was one (for showing to players). */
  seed?: JsonSeed
}

/** @internal How an Rng is put together. Use `luck()` to make one. */
export interface RngParts {
  algorithm: Algorithm
  key: Words4
  generator: Generator
  draws: number
  seed: Seed | undefined
}

const TWO_32 = 0x100000000
const TWO_53 = 9007199254740992
const TWO_26 = 67108864

function toJsonSeed(seed: Seed): JsonSeed {
  if (typeof seed === 'bigint') return String(seed)
  if (Array.isArray(seed)) return (seed as readonly Seed[]).map(toJsonSeed)
  return seed as string | number
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0')
}

function checkList(items: unknown, method: string): asserts items is ArrayLike<unknown> {
  if (
    items === null ||
    (typeof items !== 'object' && typeof items !== 'string') ||
    typeof (items as { length?: unknown }).length !== 'number'
  ) {
    throw new LuckboxError('BAD_ARGUMENT', `${method} needs a list (like an array), got ${show(items)}.`)
  }
}

/**
 * A seeded random number generator. Make one with `luck(seed)`.
 *
 * Every method is deterministic: the same seed and the same calls in the
 * same order give the same results, on every device, in every version.
 */
export class Rng {
  #gen: Generator
  #key: Words4
  #algorithm: Algorithm
  #draws: number
  #seed: Seed | undefined

  /** @internal Use `luck(seed)` or `luck.from(state)` instead. */
  constructor(parts: RngParts) {
    this.#gen = parts.generator
    this.#key = parts.key
    this.#algorithm = parts.algorithm
    this.#draws = parts.draws
    this.#seed = parts.seed
  }

  /** The seed this Rng was made from (`undefined` for forks and states saved without one). */
  get seed(): Seed | undefined {
    return this.#seed
  }

  /** The generator in use: `'sfc32'`, `'xoshiro128**'` or `'mulberry32'`. */
  get algorithm(): Algorithm {
    return this.#algorithm
  }

  /**
   * How many 32-bit numbers have been drawn. Handy when two players
   * get different results: compare this number to see where they split.
   */
  get draws(): number {
    return this.#draws
  }

  /**
   * A whole number from 0 to 4,294,967,295. The raw output of the generator.
   * @example rng.uint32() // 2891336453
   */
  uint32(): number {
    this.#draws++
    return this.#gen.next()
  }

  /**
   * A decimal from 0 (included) to 1 (never reached), with full 53-bit precision.
   * A seeded `Math.random()`.
   * @example rng.float() // 0.7316892
   */
  float(): number {
    const hi = this.uint32() >>> 5
    const lo = this.uint32() >>> 6
    return (hi * TWO_26 + lo) / TWO_53
  }

  /**
   * A whole number from `min` to `max`, both included. Every value is exactly as likely.
   * @example rng.int(1, 6) // a die roll: 1, 2, 3, 4, 5 or 6
   */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `int(min, max) needs whole numbers, got int(${show(min)}, ${show(max)}). Use range() for decimals.`,
      )
    }
    if (min > max) {
      throw new LuckboxError('BAD_ARGUMENT', `int(min, max) needs min ≤ max, got int(${min}, ${max}).`)
    }
    const size = max - min + 1
    if (size > TWO_53) {
      throw new LuckboxError('BAD_ARGUMENT', `int(${min}, ${max}) spans more than 2^53 values, which is too many.`)
    }
    return min + this.#below(size)
  }

  /** A uniform whole number in [0, n) for 1 ≤ n ≤ 2^53, with no modulo bias. */
  #below(n: number): number {
    if (n === 1) return 0
    if (n <= TWO_32) {
      const limit = TWO_32 - (TWO_32 % n)
      let x = this.uint32()
      while (x >= limit) x = this.uint32()
      return x % n
    }
    const limit = TWO_53 - (TWO_53 % n)
    let x = (this.uint32() >>> 5) * TWO_26 + (this.uint32() >>> 6)
    while (x >= limit) x = (this.uint32() >>> 5) * TWO_26 + (this.uint32() >>> 6)
    return x % n
  }

  /**
   * A decimal from `min` (included) to `max` (not included).
   * @example rng.range(0, 360) // an angle in degrees
   */
  range(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `range(min, max) needs finite numbers, got range(${show(min)}, ${show(max)}).`,
      )
    }
    if (min > max) {
      throw new LuckboxError('BAD_ARGUMENT', `range(min, max) needs min ≤ max, got range(${min}, ${max}).`)
    }
    const span = max - min
    if (!Number.isFinite(span)) {
      throw new LuckboxError('BAD_ARGUMENT', `range(${min}, ${max}) is too wide to measure.`)
    }
    let r = min + this.float() * span
    // Rounding can land exactly on max; draw again so max is never returned.
    while (r >= max && span > 0) r = min + this.float() * span
    return r
  }

  /**
   * `true` with probability `p` (from 0 to 1).
   * @example rng.chance(0.25) // true one time in four
   */
  chance(p: number): boolean {
    if (typeof p !== 'number' || !(p >= 0 && p <= 1)) {
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `chance(p) needs a probability from 0 to 1, got ${show(p)}. For 25% write chance(0.25).`,
      )
    }
    return this.float() < p
  }

  /**
   * `true` or `false`, 50/50.
   * @example rng.bool() // true
   */
  bool(): boolean {
    return this.uint32() < 0x80000000
  }

  /**
   * `1` or `-1`, 50/50. Handy for directions.
   * @example enemy.vx = speed * rng.sign()
   */
  sign(): 1 | -1 {
    return this.bool() ? 1 : -1
  }

  /**
   * One item from a list, each equally likely.
   * @example rng.pick(['sword', 'bow', 'staff']) // 'bow'
   */
  pick<T>(items: ArrayLike<T>): T {
    checkList(items, 'pick()')
    if (items.length === 0) {
      throw new LuckboxError('EMPTY_LIST', 'pick() got an empty list, so there is nothing to pick.')
    }
    return items[this.#below(items.length)] as T
  }

  /**
   * `count` different items from a list (no repeats), in random order.
   * @example rng.sample(players, 2) // two different players
   */
  sample<T>(items: ArrayLike<T>, count: number): T[] {
    checkList(items, 'sample()')
    if (!Number.isSafeInteger(count) || count < 0 || count > items.length) {
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `sample(items, count) needs a whole count from 0 to ${items.length}, got ${show(count)}.`,
      )
    }
    const copy = Array.from(items)
    for (let i = 0; i < count; i++) {
      const j = i + this.#below(copy.length - i)
      const tmp = copy[i] as T
      copy[i] = copy[j] as T
      copy[j] = tmp
    }
    copy.length = count
    return copy
  }

  /**
   * A shuffled copy of a list. The original is not changed.
   * Every order is exactly as likely (Fisher–Yates).
   * @example const deck = rng.shuffle(cards)
   */
  shuffle<T>(items: ArrayLike<T>): T[] {
    checkList(items, 'shuffle()')
    return this.shuffleInPlace(Array.from(items))
  }

  /**
   * Shuffles an array in place and returns it. Faster than `shuffle()` for big arrays.
   * @example rng.shuffleInPlace(deck)
   */
  shuffleInPlace<T>(items: T[]): T[] {
    if (!Array.isArray(items)) {
      throw new LuckboxError('BAD_ARGUMENT', `shuffleInPlace() needs an array, got ${show(items)}.`)
    }
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.#below(i + 1)
      const tmp = items[i] as T
      items[i] = items[j] as T
      items[j] = tmp
    }
    return items
  }

  /**
   * A random code made from an alphabet. The default alphabet has no
   * look-alike letters (no i, l, o, u), so players can read and type it.
   * Seeded, so not for passwords or secrets.
   * @example rng.id() // 'k3f9x2pqm7ab'
   * @example rng.id(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ') // 'QXMBTR'
   */
  id(length: number = 12, alphabet: string = READABLE_ALPHABET): string {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `id(length) needs a whole number of 0 or more, got ${show(length)}.`)
    }
    const chars = typeof alphabet === 'string' ? Array.from(alphabet) : []
    if (chars.length < 2 || new Set(chars).size !== chars.length) {
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `id(length, alphabet) needs an alphabet of 2 or more different characters, got ${show(alphabet)}.`,
      )
    }
    let out = ''
    for (let i = 0; i < length; i++) out += chars[this.#below(chars.length)]
    return out
  }

  /**
   * A seeded UUID in the standard version 4 format. The same seed gives the
   * same UUIDs, which is useful for repeatable entity ids.
   * Not for secrets: anyone with the seed can recreate them.
   * @example rng.uuid() // '3f1c9a2e-7b4d-4e8f-9a0b-1c2d3e4f5a6b'
   */
  uuid(): string {
    const a = this.uint32()
    const b = ((this.uint32() & 0xffff0fff) | 0x00004000) >>> 0
    const c = ((this.uint32() & 0x3fffffff) | 0x80000000) >>> 0
    const d = this.uint32()
    const h = hex8(a) + hex8(b) + hex8(c) + hex8(d)
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }

  /**
   * Its own random stream for one part of your game. A fork depends only on
   * the seed and the name, never on how many numbers were drawn, so adding
   * new random code in one place never changes the results in another.
   * @example
   * const loot = rng.fork('loot')
   * const weather = rng.fork('weather')
   * const level3 = rng.fork('level').fork(3)
   */
  fork(name: string | number): Rng {
    const key = forkKey(this.#key, name)
    return new Rng({
      algorithm: this.#algorithm,
      key,
      generator: generatorFromKey(this.#algorithm, key),
      draws: 0,
      seed: undefined,
    })
  }

  /**
   * An independent copy at the same position. The copy and the original
   * give the same numbers from here on, without affecting each other.
   * @example const preview = rng.clone() // peek ahead without changing rng
   */
  clone(): Rng {
    const generator = createGenerator(this.#algorithm)
    generator.load(this.#gen.save())
    return new Rng({
      algorithm: this.#algorithm,
      key: [...this.#key],
      generator,
      draws: this.#draws,
      seed: this.#seed,
    })
  }

  /**
   * Everything needed to continue exactly from here, as plain JSON.
   * Load it back with `luck.from(state)`.
   * @example
   * save.rng = rng.state()
   * // later
   * const rng = luck.from(save.rng)
   */
  state(): RngState {
    const state: RngState = {
      version: 1,
      algorithm: this.#algorithm,
      key: [...this.#key],
      words: this.#gen.save(),
      draws: this.#draws,
    }
    if (this.#seed !== undefined) state.seed = toJsonSeed(this.#seed)
    return state
  }

  /** Lets `JSON.stringify(rng)` save the state directly. */
  toJSON(): RngState {
    return this.state()
  }
}
