import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'

/** Options for `rng.fairChance()`. */
export interface FairChanceOptions {
  /** A saved `fairChance.state()` to continue from. */
  state?: FairChanceState
}

/** A fair chance's position, as plain JSON. */
export interface FairChanceState {
  /** Misses since the last success. */
  misses: number
}

const constants = new Map<number, number>()

/** Long-run success rate when the n-th try (after n−1 misses) succeeds with chance min(1, n·c). */
function rateFor(c: number): number {
  let expected = 0
  let reach = 1
  for (let n = 1; reach > 0; n++) {
    const p = Math.min(1, n * c)
    expected += n * reach * p
    reach *= 1 - p
  }
  return 1 / expected
}

/** The step c that gives an average success rate of p (found by bisection). */
export function fairConstant(p: number): number {
  let c = constants.get(p)
  if (c !== undefined) return c
  let lo = 0
  let hi = p
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (rateFor(mid) < p) lo = mid
    else hi = mid
  }
  c = (lo + hi) / 2
  constants.set(p, c)
  return c
}

/**
 * A chance that keeps its average but has no long bad-luck streaks, like
 * crits in many games ("pseudo-random distribution"). Each miss makes the
 * next try more likely; a success resets it.
 *
 * @example
 * const crit = rng.fairChance(0.25)
 * if (crit.roll()) damage *= 2 // 25% on average, never 15 misses in a row
 */
export class FairChance {
  readonly #rng: Rng
  readonly #chance: number
  readonly #step: number
  #misses = 0

  /** @internal Use `rng.fairChance(p)`. */
  constructor(rng: Rng, chance: number, options: FairChanceOptions = {}) {
    if (typeof chance !== 'number' || !(chance >= 0 && chance <= 1)) {
      throw new LuckboxError('BAD_ARGUMENT', `fairChance(p) needs a probability from 0 to 1, got ${show(chance)}.`)
    }
    if (options === null || typeof options !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `fairChance(p, options) needs options like { state }, got ${show(options)}.`)
    }
    this.#rng = rng
    this.#chance = chance
    this.#step = chance === 0 || chance === 1 ? chance : fairConstant(chance)
    const { state } = options
    if (state !== undefined) {
      const misses = (state as Partial<FairChanceState> | null)?.misses
      if (typeof misses !== 'number' || !Number.isSafeInteger(misses) || misses < 0 || misses >= this.worstCase) {
        throw new LuckboxError('BAD_STATE', `fairChance(): this saved state can't be loaded: "misses" must be a whole number from 0 to ${this.worstCase - 1}.`)
      }
      this.#misses = misses
    }
  }

  /** The average chance of success. */
  get chance(): number {
    return this.#chance
  }

  /** The chance of success on the next roll, given the misses so far. */
  get chanceNow(): number {
    return this.#chance === 0 ? 0 : Math.min(1, this.#step * (this.#misses + 1))
  }

  /** Misses since the last success. */
  get misses(): number {
    return this.#misses
  }

  /** The most tries it can ever take to succeed (Infinity for a chance of 0). */
  get worstCase(): number {
    return this.#chance === 0 ? Number.POSITIVE_INFINITY : Math.ceil(1 / this.#step - 1e-9)
  }

  /**
   * Tries once. Returns `true` on success.
   * @example if (crit.roll()) damage *= 2
   */
  roll(): boolean {
    const hit = this.#rng.float() < this.chanceNow
    this.#misses = hit ? 0 : this.#misses + 1
    return hit
  }

  /** The position as plain JSON, restored with `rng.fairChance(p, { state })`. */
  state(): FairChanceState {
    return { misses: this.#misses }
  }
}
