import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'

/** Weights by name, like `{ gold: 70, gem: 25, crown: 5 }`. */
export type Weights<K extends string = string> = Readonly<Record<K, number>>

/** Weights as `[item, weight]` pairs, for items that aren't text. */
export type WeightedEntries<T> = ReadonlyArray<readonly [T, number]>

/** Anything you can make a weighted table from. */
export type WeightedInput<T> = Weights<T & string> | WeightedEntries<T>

const TWO_53 = 9007199254740992

/**
 * A weighted table, ready for fast picks (the alias method: every pick takes
 * the same time, however many items there are). With whole-number weights
 * every pick is exact: an item with weight 7 out of 100 comes up exactly 7% of
 * the time, with no rounding.
 *
 * Make one with `luck.weights(...)` when you pick from the same table many times.
 *
 * @example
 * const drops = luck.weights({ gold: 70, gem: 25, crown: 5 })
 * drops.pick(rng) // 'gold'
 */
export class WeightedTable<T> {
  /** The items, in the order given. */
  readonly items: readonly T[]
  /** Each item's weight, in the same order. */
  readonly weights: readonly number[]
  /** The sum of all weights. */
  readonly total: number
  readonly #exact: boolean
  readonly #threshold: number[]
  readonly #alias: number[]

  /** @internal Use `luck.weights(...)`. */
  constructor(items: T[], weights: number[], method: string) {
    if (items.length === 0) throw new LuckboxError('EMPTY_LIST', `${method} got no items, so there is nothing to pick.`)
    let total = 0
    let whole = true
    weights.forEach((w, i) => {
      if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
        throw new LuckboxError(
          'BAD_ARGUMENT',
          `${method} needs weights of 0 or more, but ${show(items[i])} has weight ${show(w)}.`,
        )
      }
      if (!Number.isInteger(w)) whole = false
      total += w
    })
    if (!Number.isFinite(total)) throw new LuckboxError('BAD_ARGUMENT', `${method}: the weights add up to more than a number can hold.`)
    if (total === 0) throw new LuckboxError('EMPTY_LIST', `${method}: every weight is 0, so nothing can be picked.`)
    const n = items.length
    this.items = Object.freeze(items)
    this.weights = Object.freeze(weights)
    this.total = total
    // Whole numbers stay exact as long as n × total fits in 53 bits.
    this.#exact = whole && n * total <= TWO_53
    this.#threshold = new Array<number>(n).fill(0)
    this.#alias = new Array<number>(n).fill(0)
    this.#build(n)
  }

  /** Vose's alias method. In exact mode each column holds `total` units. */
  #build(n: number): void {
    const cap = this.#exact ? this.total : 1
    const scaled = this.weights.map((w) => (this.#exact ? w * n : (w * n) / this.total))
    const small: number[] = []
    const large: number[] = []
    for (let i = n - 1; i >= 0; i--) ((scaled[i] as number) < cap ? small : large).push(i)
    while (small.length && large.length) {
      const s = small.pop() as number
      const l = large.pop() as number
      this.#threshold[s] = scaled[s] as number
      this.#alias[s] = l
      scaled[l] = (scaled[l] as number) + (scaled[s] as number) - cap
      ;((scaled[l] as number) < cap ? small : large).push(l)
    }
    for (const i of large) {
      this.#threshold[i] = cap
      this.#alias[i] = i
    }
    // Only rounding (in decimal mode) can leave items here; they fill their column.
    for (const i of small) {
      this.#threshold[i] = cap
      this.#alias[i] = i
    }
  }

  /** How many items the table has. */
  get size(): number {
    return this.items.length
  }

  /**
   * Picks one item using `rng`.
   * @example drops.pick(rng) // 'gem'
   */
  pick(rng: Rng): T {
    const n = this.items.length
    const column = n === 1 ? 0 : rng.int(0, n - 1)
    const threshold = this.#threshold[column] as number
    const hit = this.#exact ? rng.int(0, this.total - 1) < threshold : rng.float() < threshold
    return this.items[hit ? column : (this.#alias[column] as number)] as T
  }

  /**
   * Each item's chance of being picked (0 to 1), in the order given.
   * @example drops.odds() // [{ item: 'gold', chance: 0.7 }, ...]
   */
  odds(): Array<{ item: T; chance: number }> {
    return this.items.map((item, i) => ({ item, chance: (this.weights[i] as number) / this.total }))
  }
}

/**
 * Reads the ways you can describe weights:
 * `{ gold: 70 }`, `[['gold', 70]]`, or `(items, item => weight)`.
 */
export function readWeights<T>(
  input: unknown,
  weightOf: ((item: T, index: number) => number) | undefined,
  method: string,
): WeightedTable<T> {
  if (input instanceof WeightedTable) return input as WeightedTable<T>
  if (weightOf !== undefined) {
    if (typeof weightOf !== 'function') {
      throw new LuckboxError('BAD_ARGUMENT', `${method}: the second argument must be a function like item => item.weight.`)
    }
    if (input === null || typeof input !== 'object' || typeof (input as { length?: unknown }).length !== 'number') {
      throw new LuckboxError('BAD_ARGUMENT', `${method}(items, weightOf) needs a list of items, got ${show(input)}.`)
    }
    const items = Array.from(input as ArrayLike<T>)
    return new WeightedTable(items, items.map(weightOf), method)
  }
  if (Array.isArray(input)) {
    const items: T[] = []
    const weights: number[] = []
    for (const entry of input as unknown[]) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new LuckboxError(
          'BAD_ARGUMENT',
          `${method} needs [item, weight] pairs like [['gold', 70], ['gem', 25]], but got ${show(entry)}.`,
        )
      }
      items.push(entry[0] as T)
      weights.push(entry[1] as number)
    }
    return new WeightedTable(items, weights, method)
  }
  if (input !== null && typeof input === 'object') {
    const keys = Object.keys(input)
    return new WeightedTable(keys as T[], keys.map((k) => (input as Record<string, number>)[k] as number), method)
  }
  throw new LuckboxError(
    'BAD_ARGUMENT',
    `${method} needs weights like { gold: 70, gem: 25 }, [['gold', 70]] or (items, item => weight), got ${show(input)}.`,
  )
}
