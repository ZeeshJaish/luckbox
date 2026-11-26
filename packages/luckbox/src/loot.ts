import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'
import { WeightedTable, readWeights } from './weighted.ts'

/**
 * A loot table: each drop and its weight. `{ common: 80, rare: 18, epic: 2 }`
 * means common drops 80 times in 100, rare 18 and epic 2.
 */
export type LootSpec<K extends string = string> = Readonly<Record<K, number>>

/**
 * A loot table tied to an Rng. Open it like a chest.
 *
 * @example
 * const chest = rng.loot({ common: 80, rare: 18, epic: 2 })
 * chest.open()     // 'common'
 * chest.odds()     // { common: 0.8, rare: 0.18, epic: 0.02 }
 */
export class LootTable<K extends string> {
  readonly #rng: Rng
  readonly #table: WeightedTable<K>

  /** @internal Use `rng.loot(spec)`. */
  constructor(rng: Rng, spec: LootSpec<K>) {
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new LuckboxError('BAD_ARGUMENT', `loot(table) needs drops and weights like { common: 80, rare: 20 }, got ${show(spec)}.`)
    }
    this.#rng = rng
    this.#table = readWeights<K>(spec, undefined, 'loot()')
  }

  /** The drops this table can give, in the order given. */
  get drops(): readonly K[] {
    return this.#table.items
  }

  /**
   * Opens the chest once and returns what dropped.
   * @example chest.open() // 'rare'
   */
  open(): K {
    return this.#table.pick(this.#rng)
  }

  /**
   * Opens the chest `count` times.
   * @example chest.openMany(10) // ['common', 'common', 'rare', ...]
   */
  openMany(count: number): K[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `openMany(count) needs a whole number of 0 or more, got ${show(count)}.`)
    }
    const out: K[] = []
    for (let i = 0; i < count; i++) out.push(this.open())
    return out
  }

  /**
   * The real chance of each drop (0 to 1), ready to show players.
   * @example chest.odds() // { common: 0.8, rare: 0.18, epic: 0.02 }
   */
  odds(): Record<K, number> {
    const out = {} as Record<K, number>
    for (const { item, chance } of this.#table.odds()) out[item] = chance
    return out
  }
}
