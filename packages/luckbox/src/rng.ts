import { Bag, type BagOptions, Deck, type DeckOptions } from './bag.ts'
import { type DiceRoll, type FaceFn, parseDice, rollDice, rollTotal } from './dice.ts'
import { LuckboxError, show } from './errors.ts'
import { FairChance, type FairChanceOptions } from './fair.ts'
import { Gacha, type GachaOptions, type GachaSpec } from './gacha.ts'
import { ALGORITHMS, type Algorithm, type Generator, createGenerator, generatorFromKey } from './generators.ts'
import { type Point, type ScatterOptions, scatter } from './geometry.ts'
import { type FullLootSpec, LootChest, type LootOptions, type LootSpec, LootTable } from './loot.ts'
import { exp, ln, lnGamma } from './math.ts'
import { READABLE_ALPHABET, type Seed, type Words4, forkKey, hash128 } from './seed.ts'
import { type WeightedEntries, type WeightedTable, type Weights, readWeights } from './weighted.ts'

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
const TAU = 6.283185307179586

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LuckboxError('BAD_ARGUMENT', `${what} must be a finite number, got ${show(value)}.`)
  }
  return value
}
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
  readonly #face: FaceFn = (low, high) => low + this.#below(high - low + 1)

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

  // The rejection limit for the last range used: games ask for the same range again and again.
  #lastN = 0
  #lastLimit = 0

  /** A uniform whole number in [0, n) for 1 ≤ n ≤ 2^53, with no modulo bias. */
  #below(n: number): number {
    if (n === 1) return 0
    if (n <= TWO_32) {
      if (n !== this.#lastN) {
        this.#lastN = n
        this.#lastLimit = TWO_32 - (TWO_32 % n)
      }
      const limit = this.#lastLimit
      const gen = this.#gen
      this.#draws++
      let x = gen.next()
      while (x >= limit) {
        this.#draws++
        x = gen.next()
      }
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
   * Rolls dice and returns the total. Understands standard dice notation:
   * `2d6+3`, `d20`, `4d6kh3` (keep highest 3), `2d20kl1` (keep lowest),
   * `4d6dl1` (drop lowest), `3d6!` (exploding), `2d6r1` (reroll 1s),
   * `2d6ro1` (reroll once), `d%`, `4dF` (fudge) and `5d4*10`.
   * @example rng.roll('2d6+3') // 10
   * @example rng.roll('2d20kh1') // advantage: the better of two d20s
   */
  roll(notation: string): number {
    return rollTotal(parseDice(notation), this.#face)
  }

  /**
   * Rolls dice and returns every die, which ones were kept, and a readable line.
   * Uses the same numbers as `roll()` would.
   * @example
   * rng.dice('4d6kh3+2').text // '4d6kh3 (6, 5, 1 dropped, 3) + 2 = 16'
   */
  dice(notation: string): DiceRoll {
    return rollDice(parseDice(notation), this.#face)
  }

  /**
   * Picks one item by weight. Bigger weights come up more often, and whole
   * number weights are exact: weight 5 out of 100 is exactly 5%.
   * @example rng.weighted({ gold: 70, gem: 25, crown: 5 }) // 'gold'
   * @example rng.weighted([[sword, 3], [shield, 1]])
   * @example rng.weighted(enemies, (e) => e.spawnWeight)
   */
  weighted<K extends string>(weights: Weights<K>): K
  weighted<T>(entries: WeightedEntries<T>): T
  weighted<T>(items: ArrayLike<T>, weightOf: (item: T, index: number) => number): T
  weighted<T>(table: WeightedTable<T>): T
  weighted(input: unknown, weightOf?: (item: never, index: number) => number): unknown {
    return readWeights(input, weightOf as ((item: unknown, index: number) => number) | undefined, 'weighted()').pick(this)
  }

  /**
   * A shuffle bag: each item comes out once, in random order, then it refills.
   * Variety without streaks.
   * @example
   * const pieces = rng.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
   * pieces.next() // 'T'
   */
  bag<T>(items: ArrayLike<T>, options?: BagOptions): Bag<T> {
    return new Bag(this, items, options)
  }

  /**
   * A deck of cards with a draw pile, a discard pile and a hand.
   * @example
   * const deck = rng.deck(cards)
   * const hand = deck.drawMany(5)
   */
  deck<T>(cards: ArrayLike<T>, options?: DeckOptions): Deck<T> {
    return new Deck(this, cards, options)
  }

  /**
   * A loot table you can open like a chest.
   *
   * Simple tables (`{ name: weight }`) give one drop per open. Full tables
   * (`{ drops: { ... } }`) give a list of drops, with amounts, several rolls,
   * conditions and tables inside tables. Both take hard and soft pity.
   * @example
   * const chest = rng.loot({ common: 80, rare: 18, epic: 2 }, { pity: { epic: 40 } })
   * chest.open()  // 'common'
   * chest.rates() // real long-run rates, pity included
   * @example
   * const boss = rng.loot({ rolls: 2, drops: { gold: { weight: 70, amount: [10, 50] }, sword: 30 } })
   * boss.open()   // [{ item: 'gold', amount: 23 }, { item: 'sword', amount: 1 }]
   */
  loot<K extends string>(table: LootSpec<K>, options?: LootOptions<K>): LootTable<K>
  loot<K extends string, C = unknown>(table: FullLootSpec<K, C>, options?: LootOptions<K>): LootChest<K, C>
  loot(table: unknown, options?: LootOptions): LootTable<string> | LootChest<string> {
    const drops = (table as { drops?: unknown } | null)?.drops
    if (drops !== null && typeof drops === 'object') return new LootChest(this, table as FullLootSpec, options)
    return new LootTable(this, table as LootSpec, options)
  }

  // ------------------------------------------------------------ shapes of randomness

  /**
   * A bell-curve number: most results land near `mean`, fewer far away.
   * About 68% fall within one `sd` of the mean, 95% within two.
   * @example rng.normal(100, 15) // an IQ-style stat: 85 to 115 most of the time
   */
  normal(mean: number = 0, sd: number = 1): number {
    finite(mean, 'normal(mean, sd): mean')
    if (finite(sd, 'normal(mean, sd): sd') < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `normal(mean, sd) needs sd of 0 or more, got ${sd}.`)
    }
    // Marsaglia's polar method, with luckbox's own ln so every engine agrees.
    let u: number
    let v: number
    let s: number
    do {
      u = this.float() * 2 - 1
      v = this.float() * 2 - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    return mean + sd * u * Math.sqrt((-2 * ln(s)) / s)
  }

  /**
   * Time until the next random event, when events happen `rate` times per
   * unit of time on average (exponential distribution).
   * @example const nextSpawnIn = rng.exponential(1 / 30) // 30 seconds on average
   */
  exponential(rate: number = 1): number {
    if (finite(rate, 'exponential(rate): rate') <= 0) {
      throw new LuckboxError('BAD_ARGUMENT', `exponential(rate) needs a rate above 0, got ${rate}.`)
    }
    return -ln(1 - this.float()) / rate
  }

  /**
   * How many random events happen in a period when `mean` happen on average
   * (Poisson distribution). Always a whole number of 0 or more.
   * @example const meteors = rng.poisson(3) // 3 per night on average
   */
  poisson(mean: number): number {
    if (finite(mean, 'poisson(mean): mean') < 0 || mean > 1e9) {
      throw new LuckboxError('BAD_ARGUMENT', `poisson(mean) needs a mean from 0 to 1,000,000,000, got ${mean}.`)
    }
    if (mean === 0) return 0
    if (mean < 10) {
      // Knuth: multiply uniforms until the product drops below e^-mean.
      const limit = exp(-mean)
      let k = 0
      let product = this.float()
      while (product > limit) {
        k++
        product *= this.float()
      }
      return k
    }
    // Hörmann's transformed rejection (PTRS), as used by NumPy.
    const slam = Math.sqrt(mean)
    const logMean = ln(mean)
    const b = 0.931 + 2.53 * slam
    const a = -0.059 + 0.02483 * b
    const invAlpha = 1.1239 + 1.1328 / (b - 3.4)
    const vr = 0.9277 - 3.6224 / (b - 2)
    for (;;) {
      const u = this.float() - 0.5
      const v = this.float()
      const us = 0.5 - Math.abs(u)
      const k = Math.floor(((2 * a) / us + b) * u + mean + 0.43)
      if (us >= 0.07 && v <= vr) return k
      if (k < 0 || (us < 0.013 && v > us)) continue
      if (ln(v) + ln(invAlpha) - ln(a / (us * us) + b) <= -mean + k * logMean - lnGamma(k + 1)) return k
    }
  }

  /**
   * A decimal from `min` to `max` that is most likely near `mode`
   * (triangular distribution). Handy for "usually about X" values.
   * @example rng.triangular(1, 10, 3) // damage: 1 to 10, usually around 3
   */
  triangular(min: number, max: number, mode: number = (min + max) / 2): number {
    finite(min, 'triangular(min, max, mode): min')
    finite(max, 'triangular(min, max, mode): max')
    finite(mode, 'triangular(min, max, mode): mode')
    if (!(min <= mode && mode <= max)) {
      throw new LuckboxError('BAD_ARGUMENT', `triangular(min, max, mode) needs min ≤ mode ≤ max, got (${min}, ${max}, ${mode}).`)
    }
    const u = this.float()
    if (min === max) return min
    const c = (mode - min) / (max - min)
    return u < c
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode))
  }

  // ------------------------------------------------------------ geometry

  /**
   * A random angle in radians, from 0 up to (not including) 2π.
   * For degrees use `rng.range(0, 360)`.
   * @example bullet.angle = rng.angle()
   */
  angle(): number {
    return this.float() * TAU
  }

  /**
   * A random point inside a circle centred on (0, 0), spread evenly over the area.
   * @example const { x, y } = rng.pointInCircle(50) // a spot within 50px
   */
  pointInCircle(radius: number = 1): Point {
    if (finite(radius, 'pointInCircle(radius): radius') < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `pointInCircle(radius) needs a radius of 0 or more, got ${radius}.`)
    }
    let x: number
    let y: number
    do {
      x = this.float() * 2 - 1
      y = this.float() * 2 - 1
    } while (x * x + y * y >= 1)
    return { x: x * radius + 0, y: y * radius + 0 } // + 0 turns -0 into 0
  }

  /**
   * A random point on the edge of a circle centred on (0, 0). With radius 1
   * it is a random direction.
   * @example const dir = rng.pointOnCircle() // { x, y } of length 1
   */
  pointOnCircle(radius: number = 1): Point {
    if (finite(radius, 'pointOnCircle(radius): radius') < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `pointOnCircle(radius) needs a radius of 0 or more, got ${radius}.`)
    }
    let x: number
    let y: number
    let d2: number
    do {
      x = this.float() * 2 - 1
      y = this.float() * 2 - 1
      d2 = x * x + y * y
    } while (d2 >= 1 || d2 < 1e-9)
    const d = Math.sqrt(d2)
    return { x: (x / d) * radius + 0, y: (y / d) * radius + 0 }
  }

  /**
   * A random point inside a width × height rectangle starting at (0, 0).
   * @example const spawn = rng.pointInRect(800, 600)
   */
  pointInRect(width: number, height: number): Point {
    finite(width, 'pointInRect(width, height): width')
    finite(height, 'pointInRect(width, height): height')
    return { x: this.range(0, Math.max(0, width)), y: this.range(0, Math.max(0, height)) }
  }

  /**
   * Points spread naturally over an area, never closer than `spacing`
   * (Poisson-disk sampling). Perfect for trees, rocks, stars and spawn points.
   * @example const trees = rng.scatter(1000, 1000, 40) // [{ x, y }, ...]
   */
  scatter(width: number, height: number, spacing: number, options?: ScatterOptions): Point[] {
    return scatter(this, width, height, spacing, options)
  }

  /**
   * A gacha banner: rarities with hard and soft pity, rate-up items with the
   * 50/50 and its guarantee, spark points, and the real odds to publish.
   * @example
   * const banner = rng.gacha({
   *   rates: { star5: 6, star4: 51, star3: 943 },
   *   pity: { star5: 90, star4: 10 },
   *   pools: { star5: { featured: ['Nova'], standard: ['Ash', 'Bryn'] } },
   * })
   * banner.pullMany(10)
   * banner.disclosure() // base and real rates, pity and 50/50 rules
   */
  gacha<R extends string>(spec: GachaSpec<R>, options?: GachaOptions): Gacha<R> {
    return new Gacha(this, spec, options)
  }

  /**
   * A chance with the same average but no long unlucky streaks: each miss
   * makes the next try more likely (pseudo-random distribution, as used for
   * crits in many games).
   * @example
   * const crit = rng.fairChance(0.25)
   * crit.roll() // true about 25% of the time, never 15 misses in a row
   */
  fairChance(chance: number, options?: FairChanceOptions): FairChance {
    return new FairChance(this, chance, options)
  }

  /**
   * A short fingerprint of this Rng's exact position. Two players whose
   * hashes match are in sync; if they differ, something drew a different
   * number of times.
   * @example if (rng.hash() !== hostHash) resync()
   */
  hash(): string {
    const words = [ALGORITHMS.indexOf(this.#algorithm), ...this.#key, ...this.#gen.save(), this.#draws % TWO_32, Math.floor(this.#draws / TWO_32)]
    const bytes = new Uint8Array(words.length * 4)
    words.forEach((w, i) => {
      bytes[i * 4] = w >>> 24
      bytes[i * 4 + 1] = (w >>> 16) & 0xff
      bytes[i * 4 + 2] = (w >>> 8) & 0xff
      bytes[i * 4 + 3] = w & 0xff
    })
    return hex8(hash128(bytes)[0])
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
