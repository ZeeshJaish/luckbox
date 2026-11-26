import { LuckboxError, show } from './errors.ts'
import { type LootState, LootTable, type SoftPity } from './loot.ts'
import type { Rng } from './rng.ts'

/** The items of one rarity: the featured (rate-up) ones and the standard ones. */
export interface GachaPool {
  /** Rate-up items. When this rarity drops, one of these comes out `featuredChance` of the time. */
  featured?: readonly string[]
  /** Everything else of this rarity. */
  standard?: readonly string[]
  /** The chance a drop of this rarity is featured, from 0 to 1. Default: 0.5 (the "50/50"). */
  featuredChance?: number
  /** After losing the 50/50, the next drop of this rarity is always featured. Default: true. */
  guarantee?: boolean
}

/** Spark: every pull earns a point; enough points buy an item of your choice. */
export interface GachaSpark {
  /** Points needed to buy an item, e.g. 300. */
  cost: number
  /** Items that can be bought. Default: every featured item. */
  items?: readonly string[]
}

/** A gacha banner. Rarity names are yours: `star5`, `SSR`, `legendary`… */
export interface GachaSpec<R extends string = string> {
  /** Base weight of each rarity, e.g. `{ star5: 6, star4: 51, star3: 943 }` for 0.6% / 5.1% / 94.3%. */
  rates: Readonly<Record<R, number>>
  /** Hard pity per rarity: guaranteed by this pull at the latest. */
  pity?: Partial<Record<R, number>>
  /** Soft pity per rarity: the chance climbs by `add` per pull after `after` misses. */
  softPity?: Partial<Record<R, SoftPity>>
  /** What each rarity can give. Without a pool, the rarity's own name is the item. */
  pools?: Partial<Record<R, GachaPool>>
  /** Spark (exchange points), if the banner has it. */
  spark?: GachaSpark
}

/** One result from a banner. */
export interface GachaPull<R extends string = string> {
  /** The rarity that dropped. */
  rarity: R
  /** The item. */
  item: string
  /** Whether it is a featured (rate-up) item. */
  featured: boolean
  /** Which pull this was since the last drop of this rarity (1 = the very next pull). */
  pity: number
  /** True when it was bought with spark points rather than pulled. */
  redeemed?: true
}

/** Everything needed to continue a banner exactly, as plain JSON. */
export interface GachaState {
  /** Pity counters for rarities with hard or soft pity. */
  pity: LootState
  /** Pulls since the last drop of each rarity. */
  since: Record<string, number>
  /** Rarities whose next drop is guaranteed featured (the 50/50 was lost). */
  guaranteed: Record<string, boolean>
  /** Spark points held. */
  sparks: number
  /** Total pulls so far. */
  pulls: number
}

/** Options for `rng.gacha()`. */
export interface GachaOptions {
  /** A saved `banner.state()` to continue from. */
  state?: GachaState
}

/** One line of the odds a banner publishes. */
export interface GachaItemRate {
  item: string
  rarity: string
  featured: boolean
  /** Long-run chance per pull, pity and featured guarantees included. */
  rate: number
}

/** Everything a store or a player needs to see about a banner's odds. */
export interface GachaDisclosure {
  rarities: Array<{ rarity: string; baseRate: number; rate: number; hardPity?: number; softPity?: SoftPity }>
  items: GachaItemRate[]
  /** The same facts as readable sentences. */
  rules: string[]
}

/** The result of `banner.simulate()`. */
export interface GachaSimulation {
  pulls: number
  rarities: Record<string, { count: number; rate: number; longestWait: number }>
  /** How many of each item came out. */
  items: Record<string, number>
  /** Of each rarity's drops, the share that were featured. */
  featuredShare: Record<string, number>
}

interface Pool {
  featured: string[]
  standard: string[]
  chance: number
  guarantee: boolean
}

const pct = (p: number): string => `${(p * 100).toFixed(2)}%`

function list(value: unknown, what: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new LuckboxError('BAD_ARGUMENT', `gacha(): ${what} must be a list of item names, got ${show(value)}.`)
  }
  return [...value]
}

/**
 * A gacha banner: rarities with pity, rate-up items with the 50/50 and its
 * guarantee, spark points, and the real odds to show players.
 *
 * @example
 * const banner = rng.gacha({
 *   rates: { star5: 6, star4: 51, star3: 943 },
 *   pity: { star5: 90, star4: 10 },
 *   softPity: { star5: { after: 73, add: 0.06 } },
 *   pools: { star5: { featured: ['Nova'], standard: ['Ash', 'Bryn', 'Cato'] } },
 *   spark: { cost: 300 },
 * })
 * banner.pull()       // { rarity: 'star3', item: 'star3', featured: false, pity: 1 }
 * banner.itemRates()  // Nova's real rate, pity and 50/50 guarantee included
 */
export class Gacha<R extends string> {
  readonly #rng: Rng
  readonly #spec: GachaSpec<R>
  readonly #table: LootTable<R>
  readonly #rarities: R[]
  readonly #pools = new Map<R, Pool>()
  readonly #since = new Map<R, number>()
  readonly #guaranteed = new Map<R, boolean>()
  readonly #sparkCost: number | undefined
  readonly #sparkItems: string[]
  #sparks = 0
  #pulls = 0

  /** @internal Use `rng.gacha(spec)`. */
  constructor(rng: Rng, spec: GachaSpec<R>, options: GachaOptions = {}) {
    if (spec === null || typeof spec !== 'object' || spec.rates === null || typeof spec.rates !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `gacha() needs a banner like { rates: { star5: 6, star4: 51, star3: 943 } }, got ${show(spec)}.`)
    }
    if (options === null || typeof options !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `gacha(spec, options) needs options like { state }, got ${show(options)}.`)
    }
    this.#rng = rng
    this.#spec = spec
    const pityOptions: { pity?: Partial<Record<R, number>>; softPity?: Partial<Record<R, SoftPity>>; state?: LootState } = {}
    if (spec.pity !== undefined) pityOptions.pity = spec.pity
    if (spec.softPity !== undefined) pityOptions.softPity = spec.softPity
    if (options.state !== undefined) pityOptions.state = (options.state as Partial<GachaState> | null)?.pity as LootState
    this.#table = new LootTable(rng, spec.rates, pityOptions)
    this.#rarities = [...this.#table.drops]

    const pools = spec.pools ?? {}
    if (pools === null || typeof pools !== 'object') throw new LuckboxError('BAD_ARGUMENT', `gacha(): pools must be an object, got ${show(pools)}.`)
    for (const key of Object.keys(pools)) {
      if (!this.#rarities.includes(key as R)) throw new LuckboxError('BAD_ARGUMENT', `gacha(): pools has ${show(key)}, which is not a rarity in rates.`)
    }
    const seen = new Set<string>()
    for (const r of this.#rarities) {
      const raw = (pools as Partial<Record<R, GachaPool>>)[r]
      if (raw !== undefined && (raw === null || typeof raw !== 'object')) throw new LuckboxError('BAD_ARGUMENT', `gacha(): the pool for ${show(r)} must be an object.`)
      const featured = list(raw?.featured, `${r}.featured`)
      const standard = raw ? list(raw.standard, `${r}.standard`) : [r]
      if (featured.length + standard.length === 0) throw new LuckboxError('EMPTY_LIST', `gacha(): the pool for ${show(r)} has no items.`)
      const chance = raw?.featuredChance ?? 0.5
      if (typeof chance !== 'number' || !(chance >= 0 && chance <= 1)) {
        throw new LuckboxError('BAD_ARGUMENT', `gacha(): featuredChance for ${show(r)} must be from 0 to 1, got ${show(chance)}.`)
      }
      for (const item of [...featured, ...standard]) {
        if (seen.has(item)) throw new LuckboxError('BAD_ARGUMENT', `gacha(): ${show(item)} appears more than once. Each item belongs to one rarity and one list.`)
        seen.add(item)
      }
      this.#pools.set(r, { featured, standard, chance, guarantee: raw?.guarantee !== false })
      this.#since.set(r, 0)
      this.#guaranteed.set(r, false)
    }

    const spark = spec.spark
    if (spark !== undefined) {
      if (spark === null || typeof spark !== 'object' || !Number.isSafeInteger(spark.cost) || spark.cost < 1) {
        throw new LuckboxError('BAD_ARGUMENT', `gacha(): spark needs { cost: whole number ≥ 1 }, got ${show(spark)}.`)
      }
      const allFeatured = [...this.#pools.values()].flatMap((p) => p.featured)
      const items = spark.items === undefined ? allFeatured : list(spark.items, 'spark.items')
      for (const item of items) if (!seen.has(item)) throw new LuckboxError('BAD_ARGUMENT', `gacha(): spark.items has ${show(item)}, which is not in any pool.`)
      if (items.length === 0) throw new LuckboxError('EMPTY_LIST', 'gacha(): spark has no items to buy. List them in spark.items or add featured items.')
      this.#sparkCost = spark.cost
      this.#sparkItems = items
    } else {
      this.#sparkCost = undefined
      this.#sparkItems = []
    }

    if (options.state !== undefined) this.#load(options.state)
  }

  #load(state: GachaState): void {
    const bad = (why: string): never => {
      throw new LuckboxError('BAD_STATE', `gacha(): this saved state can't be loaded: ${why}.`)
    }
    if (state === null || typeof state !== 'object') bad('expected an object')
    const { since, guaranteed, sparks, pulls } = state
    if (since === null || typeof since !== 'object' || guaranteed === null || typeof guaranteed !== 'object') bad('"since" and "guaranteed" must be objects')
    for (const [k, v] of Object.entries(since)) {
      if (!this.#since.has(k as R)) bad(`${show(k)} is not a rarity of this banner`)
      if (!Number.isSafeInteger(v) || v < 0) bad(`"since" for ${show(k)} must be a whole number`)
      this.#since.set(k as R, v)
    }
    for (const [k, v] of Object.entries(guaranteed)) {
      if (!this.#guaranteed.has(k as R)) bad(`${show(k)} is not a rarity of this banner`)
      if (typeof v !== 'boolean') bad(`"guaranteed" for ${show(k)} must be true or false`)
      this.#guaranteed.set(k as R, v)
    }
    if (!Number.isSafeInteger(sparks) || sparks < 0) bad('"sparks" must be a whole number')
    if (!Number.isSafeInteger(pulls) || pulls < 0) bad('"pulls" must be a whole number')
    this.#sparks = sparks
    this.#pulls = pulls
  }

  /** The rarities, in the order given. */
  get rarities(): readonly R[] {
    return this.#rarities
  }

  /** Spark points held. */
  get sparks(): number {
    return this.#sparks
  }

  /** Total pulls on this banner. */
  get totalPulls(): number {
    return this.#pulls
  }

  /** Whether the next drop of this rarity is guaranteed to be featured (the 50/50 was lost). */
  isGuaranteed(rarity: R): boolean {
    if (!this.#guaranteed.has(rarity)) throw new LuckboxError('BAD_ARGUMENT', `isGuaranteed(): ${show(rarity)} is not a rarity of this banner.`)
    return this.#guaranteed.get(rarity) as boolean
  }

  /**
   * Pulls once.
   * @example banner.pull() // { rarity: 'star5', item: 'Nova', featured: true, pity: 77 }
   */
  pull(): GachaPull<R> {
    const rarity = this.#table.open()
    for (const r of this.#rarities) this.#since.set(r, (this.#since.get(r) as number) + 1)
    const pity = this.#since.get(rarity) as number
    this.#since.set(rarity, 0)
    const pool = this.#pools.get(rarity) as Pool
    let featured: boolean
    if (pool.featured.length > 0 && pool.standard.length > 0) {
      featured = this.#guaranteed.get(rarity) === true || this.#rng.chance(pool.chance)
      if (pool.guarantee) this.#guaranteed.set(rarity, !featured)
    } else {
      featured = pool.featured.length > 0
    }
    const item = this.#rng.pick(featured ? pool.featured : pool.standard)
    if (this.#sparkCost !== undefined) this.#sparks++
    this.#pulls++
    return { rarity, item, featured, pity }
  }

  /**
   * Pulls `count` times, e.g. a 10-pull.
   * @example banner.pullMany(10)
   */
  pullMany(count: number): GachaPull<R>[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `pullMany(count) needs a whole number of 0 or more, got ${show(count)}.`)
    }
    return Array.from({ length: count }, () => this.pull())
  }

  /**
   * Spends spark points on a chosen item.
   * @example if (banner.sparks >= 300) banner.redeem('Nova')
   */
  redeem(item: string): GachaPull<R> {
    if (this.#sparkCost === undefined) throw new LuckboxError('BAD_ARGUMENT', 'redeem(): this banner has no spark. Add spark: { cost: 300 } to the banner.')
    if (!this.#sparkItems.includes(item)) {
      throw new LuckboxError('BAD_ARGUMENT', `redeem(): ${show(item)} can't be bought with spark. Choose one of: ${this.#sparkItems.join(', ')}.`)
    }
    if (this.#sparks < this.#sparkCost) {
      throw new LuckboxError('BAD_ARGUMENT', `redeem(): ${show(item)} costs ${this.#sparkCost} sparks, but only ${this.#sparks} are held.`)
    }
    this.#sparks -= this.#sparkCost
    // Spark items were checked against the pools when the banner was made, so this always finds one.
    const [rarity, pool] = [...this.#pools].find(([, p]) => p.featured.includes(item) || p.standard.includes(item)) as [R, Pool]
    return { rarity, item, featured: pool.featured.includes(item), pity: 0, redeemed: true }
  }

  /** The chance of each rarity on the next pull, with pity as it stands. */
  odds(): Record<R, number> {
    return this.#table.odds()
  }

  /** The long-run chance of each rarity per pull, pity included. */
  rates(): Record<R, number> {
    return this.#table.rates()
  }

  /** The share of a rarity's drops that are featured, in the long run. */
  #featuredShare(pool: Pool): number {
    if (pool.featured.length === 0) return 0
    if (pool.standard.length === 0) return 1
    // With the guarantee, a loss makes the next one certain: the long-run share is 1 / (2 − p).
    return pool.guarantee ? 1 / (2 - pool.chance) : pool.chance
  }

  /**
   * The long-run chance of every item per pull, with pity and the featured
   * guarantee included.
   * @example banner.itemRates().find((r) => r.item === 'Nova')?.rate // 0.0105
   */
  itemRates(): GachaItemRate[] {
    const rates = this.rates()
    const out: GachaItemRate[] = []
    for (const [rarity, pool] of this.#pools) {
      const share = this.#featuredShare(pool)
      const rate = rates[rarity]
      for (const item of pool.featured) out.push({ item, rarity, featured: true, rate: (rate * share) / pool.featured.length })
      for (const item of pool.standard) out.push({ item, rarity, featured: false, rate: (rate * (1 - share)) / pool.standard.length })
    }
    return out
  }

  /**
   * The banner's full odds disclosure: base and long-run rates per rarity,
   * pity rules, featured rules, every item's rate, and readable sentences.
   * Many countries require games to publish exactly this.
   * @example banner.disclosure().rules.join('\n')
   */
  disclosure(): GachaDisclosure {
    const rates = this.rates()
    const total = this.#rarities.reduce((s, r) => s + (this.#spec.rates[r] as number), 0)
    const rules: string[] = []
    const rarities = this.#rarities.map((rarity) => {
      const baseRate = (this.#spec.rates[rarity] as number) / total
      const entry: GachaDisclosure['rarities'][number] = { rarity, baseRate, rate: rates[rarity] }
      const hard = this.#spec.pity?.[rarity]
      const soft = this.#spec.softPity?.[rarity]
      let line = `${rarity}: ${pct(baseRate)} base chance per pull, ${pct(rates[rarity])} overall`
      if (hard !== undefined || soft !== undefined) line += ' including pity'
      line += '.'
      if (hard !== undefined) {
        entry.hardPity = hard
        line += ` Guaranteed by pull ${hard} at the latest.`
      }
      if (soft !== undefined) {
        entry.softPity = soft
        line += ` From pull ${soft.after + 1}, the chance rises by ${(soft.add * 100).toFixed(2)} percentage points per pull.`
      }
      rules.push(line)
      const pool = this.#pools.get(rarity) as Pool
      if (pool.featured.length > 0 && pool.standard.length > 0) {
        rules.push(
          `${rarity}: ${pct(pool.chance)} chance the item is featured (${pool.featured.join(', ')}).` +
            (pool.guarantee ? ` If it isn't, the next ${rarity} is guaranteed featured.` : ''),
        )
      }
      return entry
    })
    if (this.#sparkCost !== undefined) {
      rules.push(`Spark: every pull earns 1 point; ${this.#sparkCost} points buy one of: ${this.#sparkItems.join(', ')}.`)
    }
    return { rarities, items: this.itemRates(), rules }
  }

  /**
   * Pulls a copy of this banner many times on its own stream (a fork, so your
   * game's Rng and pity are untouched) and reports what came out.
   * @example banner.simulate(100_000).featuredShare.star5 // about 0.667
   */
  simulate(pulls: number, options: { seed?: string } = {}): GachaSimulation {
    if (!Number.isSafeInteger(pulls) || pulls < 0 || pulls > 100_000_000) {
      throw new LuckboxError('BAD_ARGUMENT', `simulate(pulls) needs a whole number from 0 to 100,000,000, got ${show(pulls)}.`)
    }
    if (options === null || typeof options !== 'object' || (options.seed !== undefined && typeof options.seed !== 'string')) {
      throw new LuckboxError('BAD_ARGUMENT', `simulate(pulls, options) needs options like { seed: 'text' }, got ${show(options)}.`)
    }
    const sim = new Gacha(this.#rng.fork(`luckbox:gacha-simulate:${options.seed ?? ''}`), this.#spec)
    const counts = new Map<R, { count: number; featured: number; wait: number; longestWait: number }>()
    for (const r of this.#rarities) counts.set(r, { count: 0, featured: 0, wait: 0, longestWait: 0 })
    const items: Record<string, number> = {}
    for (let i = 0; i < pulls; i++) {
      const p = sim.pull()
      items[p.item] = (items[p.item] ?? 0) + 1
      for (const [r, c] of counts) {
        if (r === p.rarity) {
          c.count++
          if (p.featured) c.featured++
          c.wait = 0
        } else c.longestWait = Math.max(c.longestWait, ++c.wait)
      }
    }
    const rarities: GachaSimulation['rarities'] = {}
    const featuredShare: Record<string, number> = {}
    for (const [r, c] of counts) {
      rarities[r] = { count: c.count, rate: pulls === 0 ? 0 : c.count / pulls, longestWait: c.longestWait }
      featuredShare[r] = c.count === 0 ? 0 : c.featured / c.count
    }
    return { pulls, rarities, items, featuredShare }
  }

  /** Everything needed to continue exactly, as plain JSON. Restore with `rng.gacha(spec, { state })`. */
  state(): GachaState {
    return {
      pity: this.#table.state(),
      since: Object.fromEntries(this.#since),
      guaranteed: Object.fromEntries(this.#guaranteed),
      sparks: this.#sparks,
      pulls: this.#pulls,
    }
  }
}
