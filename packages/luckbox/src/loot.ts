import { parseDice } from './dice.ts'
import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'
import { WeightedTable, readWeights } from './weighted.ts'

/**
 * A simple loot table: each drop and its weight. `{ common: 80, rare: 18, epic: 2 }`
 * means common drops 80 times in 100, rare 18 and epic 2. Opening it gives one drop.
 */
export type LootSpec<K extends string = string> = Readonly<Record<K, number>>

/** Soft pity: after `after` opens without the drop, its chance rises by `add` each open. */
export interface SoftPity {
  /** Opens without the drop before the boost starts. */
  after: number
  /** How much the chance rises per extra open, from 0 to 1 (0.06 = +6 points). */
  add: number
}

/** Pity options for `rng.loot()`. */
export interface LootOptions<K extends string = string> {
  /**
   * Hard pity: the drop is guaranteed on this open at the latest.
   * `{ epic: 90 }` means 89 opens without an epic make the 90th an epic.
   */
  pity?: Partial<Record<K, number>>
  /** Soft pity: chances that climb after a dry run. `{ epic: { after: 73, add: 0.06 } }` */
  softPity?: Partial<Record<K, SoftPity>>
  /** A saved `table.state()` to continue from. */
  state?: LootState
}

/** A loot table's pity counters, as plain JSON. */
export interface LootState {
  /** Opens since each pity drop last dropped. */
  misses: Record<string, number>
}

/** Balancing numbers for one drop from `simulate()`. */
export interface LootDropStats {
  /** How many times it dropped. */
  count: number
  /** The share of opens that gave it (0 to 1). */
  rate: number
  /** The most opens in a row without it. */
  longestWait: number
  /** The total amount that dropped (full tables only; equals count for simple ones). */
  amount: number
}

/** The result of `simulate()`. */
export interface LootSimulation {
  /** How many opens were simulated. */
  opens: number
  /** Numbers for every drop that can come out. */
  drops: Record<string, LootDropStats>
}

/** Options for `simulate()`. */
export interface SimulateOptions<C = unknown> {
  /** Names the simulation's own stream (a fork of the table's Rng). Same name, same results. */
  seed?: string
  /** The context passed to `when` conditions (full tables). */
  context?: C
}

// ---------------------------------------------------------------- pity

const RATE_STATES_LIMIT = 200_000

/** Tracks misses for pity drops and turns them into chances. */
class Pity {
  readonly keys: readonly string[]
  readonly hard = new Map<string, number>()
  readonly soft = new Map<string, SoftPity>()
  readonly misses = new Map<string, number>()

  constructor(keys: readonly string[], options: LootOptions, method: string) {
    if (options === null || typeof options !== 'object') {
      throw new LuckboxError('BAD_ARGUMENT', `${method} options must be an object like { pity: { epic: 90 } }, got ${show(options)}.`)
    }
    this.keys = keys
    const known = (k: string, what: string): void => {
      if (!keys.includes(k)) throw new LuckboxError('BAD_ARGUMENT', `${method} ${what}: ${show(k)} is not a drop in this table.`)
    }
    const { pity, softPity, state } = options
    if (pity !== undefined) {
      if (pity === null || typeof pity !== 'object') throw new LuckboxError('BAD_ARGUMENT', `${method} pity must be an object like { epic: 90 }, got ${show(pity)}.`)
      for (const [k, n] of Object.entries(pity)) {
        known(k, 'pity')
        if (!Number.isSafeInteger(n) || (n as number) < 1) {
          throw new LuckboxError('BAD_ARGUMENT', `${method} pity for ${show(k)} must be a whole number of opens (1 or more), got ${show(n)}.`)
        }
        this.hard.set(k, n as number)
      }
    }
    if (softPity !== undefined) {
      if (softPity === null || typeof softPity !== 'object') {
        throw new LuckboxError('BAD_ARGUMENT', `${method} softPity must be an object like { epic: { after: 73, add: 0.06 } }, got ${show(softPity)}.`)
      }
      for (const [k, sp] of Object.entries(softPity)) {
        known(k, 'softPity')
        const after = (sp as Partial<SoftPity> | null)?.after
        const add = (sp as Partial<SoftPity> | null)?.add
        if (!Number.isSafeInteger(after) || (after as number) < 0 || typeof add !== 'number' || !(add > 0 && add <= 1)) {
          throw new LuckboxError(
            'BAD_ARGUMENT',
            `${method} softPity for ${show(k)} needs { after: whole number ≥ 0, add: 0 to 1 }, got ${show(sp)}.`,
          )
        }
        this.soft.set(k, { after: after as number, add })
      }
    }
    for (const k of keys) if (this.hard.has(k) || this.soft.has(k)) this.misses.set(k, 0)
    if (state !== undefined) this.load(state, method)
  }

  get tracked(): boolean {
    return this.misses.size > 0
  }

  load(state: LootState, method: string): void {
    const misses = (state as Partial<LootState> | null)?.misses
    if (misses === null || typeof misses !== 'object') {
      throw new LuckboxError('BAD_STATE', `${method}: this saved state can't be loaded: "misses" must be an object.`)
    }
    for (const [k, m] of Object.entries(misses)) {
      if (!this.misses.has(k)) throw new LuckboxError('BAD_STATE', `${method}: this saved state can't be loaded: ${show(k)} has no pity in this table.`)
      const cap = this.hard.get(k)
      if (!Number.isSafeInteger(m) || (m as number) < 0 || (cap !== undefined && (m as number) >= cap)) {
        throw new LuckboxError('BAD_STATE', `${method}: this saved state can't be loaded: misses for ${show(k)} is ${show(m)}.`)
      }
      this.misses.set(k, m as number)
    }
  }

  state(): LootState {
    return { misses: Object.fromEntries(this.misses) }
  }

  /** A hard-pity drop that must come out now, if any: the rarest one first. */
  forced(base: readonly number[], available: readonly boolean[]): number {
    let pick = -1
    this.keys.forEach((k, i) => {
      const n = this.hard.get(k)
      if (n === undefined || !available[i] || (this.misses.get(k) as number) + 1 < n) return
      if (pick === -1 || (base[i] as number) < (base[pick] as number)) pick = i
    })
    return pick
  }

  /** Is any soft pity raising a chance right now? */
  boosting(available: readonly boolean[]): boolean {
    return this.keys.some((k, i) => {
      const sp = this.soft.get(k)
      return sp !== undefined && available[i] && (this.misses.get(k) as number) >= sp.after
    })
  }

  /** Chances for the next pick, with soft pity applied. Other drops share what's left in proportion. */
  chances(base: readonly number[], available: readonly boolean[]): number[] {
    const boosted: number[] = []
    let sumQ = 0
    let sumP = 0
    const q = base.map((p, i) => {
      const k = this.keys[i] as string
      const sp = this.soft.get(k)
      const m = this.misses.get(k)
      if (sp === undefined || m === undefined || !available[i] || m < sp.after) return p
      const v = Math.min(1, p + sp.add * (m - sp.after + 1))
      boosted.push(i)
      sumQ += v
      sumP += p
      return v
    })
    if (boosted.length === 0) return [...base]
    const isBoosted = new Set(boosted)
    if (sumQ >= 1 || 1 - sumP <= 0) return q.map((v, i) => (isBoosted.has(i) ? v / sumQ : 0))
    const scale = (1 - sumQ) / (1 - sumP)
    return q.map((v, i) => (isBoosted.has(i) ? v : v * scale))
  }

  /** Updates the misses after an open. Hard-pity misses stop at their limit. */
  record(dropped: ReadonlySet<string>): void {
    for (const [k, m] of this.misses) {
      const cap = this.hard.get(k)
      this.misses.set(k, dropped.has(k) ? 0 : cap === undefined ? m + 1 : Math.min(m + 1, cap - 1))
    }
  }
}

/** Picks an index from chances that add up to 1, with one decimal draw. */
function pickByChance(rng: Rng, chances: readonly number[]): number {
  const u = rng.float()
  let sum = 0
  let last = -1
  for (let i = 0; i < chances.length; i++) {
    const c = chances[i] as number
    if (c <= 0) continue
    sum += c
    last = i
    if (u < sum) return i
  }
  return last
}

/** Tracks counts and dry runs for simulate(). */
class Tally {
  readonly opens: number
  readonly stats = new Map<string, { count: number; amount: number; wait: number; longestWait: number; seenThisOpen: boolean }>()
  constructor(opens: number, items: Iterable<string>) {
    this.opens = opens
    for (const item of items) this.stats.set(item, { count: 0, amount: 0, wait: 0, longestWait: 0, seenThisOpen: false })
  }
  add(item: string, amount: number): void {
    let s = this.stats.get(item)
    if (!s) {
      s = { count: 0, amount: 0, wait: 0, longestWait: 0, seenThisOpen: false }
      this.stats.set(item, s)
    }
    s.count++
    s.amount += amount
    s.seenThisOpen = true
  }
  endOpen(): void {
    for (const s of this.stats.values()) {
      if (s.seenThisOpen) s.wait = 0
      else s.longestWait = Math.max(s.longestWait, ++s.wait)
      s.seenThisOpen = false
    }
  }
  result(): LootSimulation {
    const drops: Record<string, LootDropStats> = {}
    for (const [item, s] of this.stats) {
      drops[item] = { count: s.count, rate: this.opens === 0 ? 0 : s.count / this.opens, longestWait: s.longestWait, amount: s.amount }
    }
    return { opens: this.opens, drops }
  }
}

function checkCount(count: unknown, method: string, limit = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > limit) {
    throw new LuckboxError('BAD_ARGUMENT', `${method} needs a whole number from 0 to ${limit.toLocaleString('en-US')}, got ${show(count)}.`)
  }
  return count as number
}

// ---------------------------------------------------------------- simple tables

/**
 * A loot table tied to an Rng. Open it like a chest; each open gives one drop.
 *
 * @example
 * const chest = rng.loot({ common: 80, rare: 18, epic: 2 }, { pity: { epic: 40 } })
 * chest.open()     // 'common'
 * chest.odds()     // chances on the next open
 * chest.rates()    // real long-run rates including pity
 */
export class LootTable<K extends string> {
  readonly #rng: Rng
  readonly #spec: LootSpec<K>
  readonly #options: LootOptions<K>
  readonly #table: WeightedTable<K>
  readonly #base: number[]
  readonly #all: boolean[]
  readonly #pity: Pity

  /** @internal Use `rng.loot(table)`. */
  constructor(rng: Rng, spec: LootSpec<K>, options: LootOptions<K> = {}) {
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new LuckboxError('BAD_ARGUMENT', `loot(table) needs drops and weights like { common: 80, rare: 20 }, got ${show(spec)}.`)
    }
    for (const [k, v] of Object.entries(spec)) {
      if (typeof v === 'object' && v !== null && (k === 'pity' || k === 'softPity')) {
        throw new LuckboxError('BAD_ARGUMENT', `loot(): put ${k} in the second argument: rng.loot(table, { ${k}: ... }).`)
      }
    }
    this.#rng = rng
    this.#spec = spec
    this.#options = options
    this.#table = readWeights<K>(spec, undefined, 'loot()')
    this.#base = this.#table.weights.map((w) => w / this.#table.total)
    this.#all = this.#base.map(() => true)
    this.#pity = new Pity(this.#table.items, options, 'loot()')
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
    const forced = this.#pity.forced(this.#base, this.#all)
    let result: K
    if (forced !== -1) result = this.#table.items[forced] as K
    else if (this.#pity.boosting(this.#all)) result = this.#table.items[pickByChance(this.#rng, this.#pity.chances(this.#base, this.#all))] as K
    else result = this.#table.pick(this.#rng)
    if (this.#pity.tracked) this.#pity.record(new Set([result]))
    return result
  }

  /**
   * Opens the chest `count` times.
   * @example chest.openMany(10) // ['common', 'common', 'rare', ...]
   */
  openMany(count: number): K[] {
    checkCount(count, 'openMany(count)')
    const out: K[] = []
    for (let i = 0; i < count; i++) out.push(this.open())
    return out
  }

  /**
   * The chance of each drop on the next open (0 to 1), including pity
   * as it stands right now.
   * @example chest.odds() // { common: 0.8, rare: 0.18, epic: 0.02 }
   */
  odds(): Record<K, number> {
    const forced = this.#pity.forced(this.#base, this.#all)
    const chances = forced !== -1 ? this.#base.map((_, i) => (i === forced ? 1 : 0)) : this.#pity.chances(this.#base, this.#all)
    const out = {} as Record<K, number>
    this.#table.items.forEach((k, i) => {
      out[k] = chances[i] as number
    })
    return out
  }

  /**
   * The real long-run drop rates, including pity: the numbers to publish for
   * gacha odds disclosure. Without pity they equal the base chances.
   * @example
   * rng.loot({ star5: 6, star4: 51, star3: 943 }, { pity: { star5: 90, star4: 10 } }).rates()
   * // star5 ≈ 0.016 (1.6%), not 0.6%
   */
  rates(): Record<K, number> {
    const items = this.#table.items
    const tracked = items.map((k, i) => [k, i] as const).filter(([k]) => this.#pity.misses.has(k))
    const out = {} as Record<K, number>
    if (tracked.length === 0) return this.odds()
    // Highest misses count each pity drop can reach (beyond it, nothing changes).
    const caps = tracked.map(([k, i]) => {
      const hard = this.#pity.hard.get(k)
      const sp = this.#pity.soft.get(k)
      let cap = hard === undefined ? Number.POSITIVE_INFINITY : hard - 1
      if (sp) cap = Math.min(cap, sp.after + Math.max(0, Math.ceil((1 - (this.#base[i] as number)) / sp.add - 1e-12)))
      return cap
    })
    let states = 1
    for (const c of caps) states *= c + 1
    if (!Number.isFinite(states) || states > RATE_STATES_LIMIT) {
      throw new LuckboxError('BAD_ARGUMENT', 'rates(): this pity setup is too big to work out exactly. Use simulate() instead.')
    }
    const probe = new Pity(items, this.#options, 'loot()')
    const decode = (s: number): number[] => {
      const m: number[] = []
      for (const c of caps) {
        m.push(s % (c + 1))
        s = Math.floor(s / (c + 1))
      }
      return m
    }
    // Transitions: from each state, the chance of each drop and where it leads.
    const chanceRows: number[][] = []
    const nextRows: number[][] = []
    for (let s = 0; s < states; s++) {
      const m = decode(s)
      tracked.forEach(([k], t) => probe.misses.set(k, m[t] as number))
      const forced = probe.forced(this.#base, this.#all)
      const chances = forced !== -1 ? this.#base.map((_, i) => (i === forced ? 1 : 0)) : probe.chances(this.#base, this.#all)
      chanceRows.push(chances)
      nextRows.push(
        items.map((_, i) => {
          let index = 0
          let radix = 1
          tracked.forEach(([, ti], t) => {
            const next = ti === i ? 0 : Math.min((m[t] as number) + 1, caps[t] as number)
            index += next * radix
            radix *= (caps[t] as number) + 1
          })
          return index
        }),
      )
    }
    // Stationary distribution by (lazy) power iteration from the starting state.
    let pi = new Float64Array(states)
    pi[0] = 1
    const maxIterations = Math.max(1000, Math.floor(400_000_000 / (states * items.length)))
    for (let iter = 0; iter < maxIterations; iter++) {
      const next = new Float64Array(states)
      for (let s = 0; s < states; s++) {
        const p = pi[s] as number
        if (p === 0) continue
        next[s] = (next[s] as number) + p / 2
        const chances = chanceRows[s] as number[]
        const targets = nextRows[s] as number[]
        for (let i = 0; i < chances.length; i++) {
          const c = chances[i] as number
          if (c > 0) next[targets[i] as number] = (next[targets[i] as number] as number) + (p * c) / 2
        }
      }
      let diff = 0
      for (let s = 0; s < states; s++) diff += Math.abs((next[s] as number) - (pi[s] as number))
      pi = next
      if (diff < 1e-14) break
    }
    items.forEach((k, i) => {
      let r = 0
      for (let s = 0; s < states; s++) r += (pi[s] as number) * ((chanceRows[s] as number[])[i] as number)
      out[k] = r
    })
    return out
  }

  /**
   * Opens a copy of this table many times on its own stream (a fork, so your
   * game's Rng and pity are untouched) and reports how often each drop came, and the longest
   * dry run. Use it to balance tables.
   * @example chest.simulate(100_000).drops.epic // { count, rate, longestWait, amount }
   */
  simulate(opens: number, options: SimulateOptions = {}): LootSimulation {
    checkCount(opens, 'simulate(opens)', 100_000_000)
    const sim = new LootTable(simRng(this.#rng, options), this.#spec, { ...this.#options, state: { misses: {} } } as LootOptions<K>)
    const tally = new Tally(opens, this.#table.items)
    for (let i = 0; i < opens; i++) {
      tally.add(sim.open(), 1)
      tally.endOpen()
    }
    return tally.result()
  }

  /** The pity counters as plain JSON. Restore with `rng.loot(table, { ...options, state })`. */
  state(): LootState {
    return this.#pity.state()
  }
}

/** Simulations run on their own fork, so they never move the game's Rng. */
function simRng(rng: Rng, options: SimulateOptions<unknown>): Rng {
  if (options === null || typeof options !== 'object') {
    throw new LuckboxError('BAD_ARGUMENT', `simulate(opens, options) needs options like { seed, context }, got ${show(options)}.`)
  }
  const seed = options.seed
  if (seed !== undefined && typeof seed !== 'string') {
    throw new LuckboxError('BAD_ARGUMENT', `simulate() seed must be text, got ${show(seed)}.`)
  }
  return rng.fork(`luckbox:simulate:${seed ?? ''}`)
}

// ---------------------------------------------------------------- full tables

/**
 * How many of an item drop: a number, `[min, max]`, or dice like `'2d6*10'`.
 * (Typed as a number list so `[10, 50]` works without `as const`; it must have exactly two numbers.)
 */
export type LootAmount = number | readonly number[] | string

/** One drop in a full loot table. */
export interface LootDrop<C = unknown> {
  /** How likely this drop is, compared with the others. */
  weight: number
  /** How many drop. Default: 1. */
  amount?: LootAmount
  /** Only drops when this returns true for the context passed to `open(context)`. */
  when?: (context: C) => boolean
  /** A table inside this table: when picked, it is opened and its drops are added. */
  table?: LootSpec | FullLootSpec<string, C>
}

/** A full loot table with amounts, several rolls, conditions and tables inside tables. */
export interface FullLootSpec<K extends string = string, C = unknown> {
  /** The drops: a weight, or `{ weight, amount, when, table }`. A drop named `nothing` gives nothing. */
  drops: Readonly<Record<K, number | LootDrop<C>>>
  /** How many picks per open: a number or `[min, max]`. Default: 1. */
  rolls?: number | readonly number[]
  /** No drop picked twice in the same open. Default: false. */
  unique?: boolean
  /** Drops added to every open, on top of the rolls. (NoInfer: drop names come from `drops` only.) */
  always?: readonly NoInfer<K>[]
}

/** One item that came out of a full loot table. */
export interface Drop {
  /** The drop's name. */
  item: string
  /** How many. */
  amount: number
}

interface Entry {
  key: string
  weight: number
  amount: { kind: 'fixed'; value: number } | { kind: 'range'; min: number; max: number } | { kind: 'dice'; notation: string }
  when: ((context: unknown) => boolean) | undefined
  table: Node | undefined
  nothing: boolean
}

interface Node {
  entries: Entry[]
  rolls: [number, number]
  unique: boolean
  always: number[]
}

const MAX_DEPTH = 8

function compile(spec: unknown, path: string, depth: number): Node {
  const where = path ? ` (in ${path})` : ''
  if (depth > MAX_DEPTH) throw new LuckboxError('BAD_ARGUMENT', `loot(): tables can be nested at most ${MAX_DEPTH} deep${where}.`)
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new LuckboxError('BAD_ARGUMENT', `loot() needs a table like { drops: { gold: 60, gem: 40 } }${where}, got ${show(spec)}.`)
  }
  const isFull = typeof (spec as { drops?: unknown }).drops === 'object' && (spec as { drops?: unknown }).drops !== null
  const full = (isFull ? spec : { drops: spec }) as FullLootSpec<string>
  const drops = full.drops
  if (Array.isArray(drops)) throw new LuckboxError('BAD_ARGUMENT', `loot(): "drops" must be an object like { gold: 60 }${where}.`)
  const entries: Entry[] = []
  for (const [key, raw] of Object.entries(drops)) {
    const label = `${show(key)}${where}`
    const d: LootDrop = typeof raw === 'number' ? { weight: raw } : (raw as LootDrop)
    if (d === null || typeof d !== 'object') throw new LuckboxError('BAD_ARGUMENT', `loot(): drop ${label} must be a weight or { weight, ... }, got ${show(raw)}.`)
    if (typeof d.weight !== 'number' || !Number.isFinite(d.weight) || d.weight < 0) {
      throw new LuckboxError('BAD_ARGUMENT', `loot(): drop ${label} needs a weight of 0 or more, got ${show(d.weight)}.`)
    }
    let amount: Entry['amount'] = { kind: 'fixed', value: 1 }
    const a = d.amount
    if (typeof a === 'number') {
      if (!Number.isSafeInteger(a) || a < 0) throw new LuckboxError('BAD_ARGUMENT', `loot(): amount for ${label} must be a whole number of 0 or more, got ${a}.`)
      amount = { kind: 'fixed', value: a }
    } else if (Array.isArray(a)) {
      const [min, max] = a as [number, number]
      if (a.length !== 2 || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || min > max) {
        throw new LuckboxError('BAD_ARGUMENT', `loot(): amount for ${label} must be [min, max] with 0 ≤ min ≤ max, got ${show(a)}.`)
      }
      amount = { kind: 'range', min, max }
    } else if (typeof a === 'string') {
      parseDice(a)
      amount = { kind: 'dice', notation: a }
    } else if (a !== undefined) {
      throw new LuckboxError('BAD_ARGUMENT', `loot(): amount for ${label} must be a number, [min, max] or dice like '2d6', got ${show(a)}.`)
    }
    if (d.when !== undefined && typeof d.when !== 'function') {
      throw new LuckboxError('BAD_ARGUMENT', `loot(): "when" for ${label} must be a function like ctx => ctx.level > 10.`)
    }
    entries.push({
      key,
      weight: d.weight,
      amount,
      when: d.when as Entry['when'],
      table: d.table === undefined ? undefined : compile(d.table, path ? `${path} > ${key}` : key, depth + 1),
      nothing: key === 'nothing',
    })
  }
  if (entries.length === 0) throw new LuckboxError('EMPTY_LIST', `loot(): the table has no drops${where}.`)
  const rolls = full.rolls ?? 1
  let range: [number, number]
  if (typeof rolls === 'number') range = [rolls, rolls]
  else if (Array.isArray(rolls) && rolls.length === 2) range = [rolls[0] as number, rolls[1] as number]
  else throw new LuckboxError('BAD_ARGUMENT', `loot(): rolls must be a number or [min, max]${where}, got ${show(rolls)}.`)
  if (!range.every((r) => Number.isSafeInteger(r) && r >= 0 && r <= 1000) || range[0] > range[1]) {
    throw new LuckboxError('BAD_ARGUMENT', `loot(): rolls must be whole numbers from 0 to 1,000 with min ≤ max${where}, got ${show(rolls)}.`)
  }
  const always = (full.always ?? []).map((k) => {
    const i = entries.findIndex((e) => e.key === k)
    if (i === -1) throw new LuckboxError('BAD_ARGUMENT', `loot(): always lists ${show(k)}, which is not a drop${where}.`)
    return i
  })
  if (range[1] > 0 && entries.every((e) => e.weight === 0)) {
    throw new LuckboxError('EMPTY_LIST', `loot(): every weight is 0, so nothing can be picked${where}.`)
  }
  return { entries, rolls: range, unique: full.unique === true, always }
}

/**
 * A full loot table tied to an Rng: amounts, several rolls, conditions,
 * tables inside tables, and pity. Each open returns a list of drops.
 *
 * @example
 * const chest = rng.loot({
 *   rolls: [1, 3],
 *   drops: {
 *     nothing: 30,
 *     gold: { weight: 50, amount: [10, 50] },
 *     gem: { weight: 20, when: (player) => player.level >= 10 },
 *   },
 * })
 * chest.open(player) // [{ item: 'gold', amount: 23 }, { item: 'gem', amount: 1 }]
 */
export class LootChest<K extends string, C = unknown> {
  readonly #rng: Rng
  readonly #spec: FullLootSpec<K, C>
  readonly #options: LootOptions<K>
  readonly #root: Node
  readonly #pity: Pity

  /** @internal Use `rng.loot({ drops: ... })`. */
  constructor(rng: Rng, spec: FullLootSpec<K, C>, options: LootOptions<K> = {}) {
    this.#rng = rng
    this.#spec = spec
    this.#options = options
    this.#root = compile(spec, '', 0)
    this.#pity = new Pity(
      this.#root.entries.map((e) => e.key),
      options,
      'loot()',
    )
  }

  /** The top-level drops, in the order given. */
  get drops(): readonly K[] {
    return this.#root.entries.map((e) => e.key as K)
  }

  #available(node: Node, context: unknown): boolean[] {
    return node.entries.map((e) => e.weight > 0 && (e.when === undefined || e.when(context) === true))
  }

  #base(node: Node, available: readonly boolean[], used: ReadonlySet<number>): number[] {
    let total = 0
    node.entries.forEach((e, i) => {
      if (available[i] && !used.has(i)) total += e.weight
    })
    return node.entries.map((e, i) => (available[i] && !used.has(i) && total > 0 ? e.weight / total : 0))
  }

  /** One weighted pick among the available entries. Whole-number weights are exact. */
  #pick(node: Node, available: readonly boolean[], used: ReadonlySet<number>): number {
    let total = 0
    let whole = true
    node.entries.forEach((e, i) => {
      if (!available[i] || used.has(i)) return
      total += e.weight
      if (!Number.isInteger(e.weight)) whole = false
    })
    if (total <= 0) return -1
    let r = whole && Number.isSafeInteger(total) ? this.#rng.int(0, total - 1) : this.#rng.float() * total
    let last = -1
    for (let i = 0; i < node.entries.length; i++) {
      const e = node.entries[i] as Entry
      if (!available[i] || used.has(i) || e.weight <= 0) continue
      last = i
      if (r < e.weight) return i
      r -= e.weight
    }
    return last
  }

  #amount(e: Entry): number {
    const a = e.amount
    if (a.kind === 'fixed') return a.value
    if (a.kind === 'range') return this.#rng.int(a.min, a.max)
    return Math.max(0, this.#rng.roll(a.notation))
  }

  #open(node: Node, context: unknown, out: Drop[], pity: Pity | undefined, dropped: Set<string>): void {
    const available = this.#available(node, context)
    const used = new Set<number>()
    const emit = (i: number): void => {
      const e = node.entries[i] as Entry
      dropped.add(e.key)
      if (e.nothing) return
      if (e.table) this.#open(e.table, context, out, undefined, new Set())
      else out.push({ item: e.key, amount: this.#amount(e) })
    }
    for (const i of node.always) emit(i)
    const [min, max] = node.rolls
    const rolls = min === max ? min : this.#rng.int(min, max)
    for (let r = 0; r < rolls; r++) {
      let i = -1
      if (pity) {
        const base = this.#base(node, available, used)
        const ok = available.map((a, j) => a && !used.has(j))
        const forced = r === 0 ? pity.forced(base, ok) : -1
        if (forced !== -1) i = forced
        else if (pity.boosting(ok)) i = pickByChance(this.#rng, pity.chances(base, ok))
      }
      if (i === -1) i = this.#pick(node, available, used)
      if (i === -1) break
      if (node.unique) used.add(i)
      emit(i)
    }
  }

  /**
   * Opens the chest once. Returns every drop with its amount (an empty list
   * if nothing dropped). The context goes to the `when` conditions.
   * @example chest.open(player) // [{ item: 'gold', amount: 23 }]
   */
  open(context?: C): Drop[] {
    const out: Drop[] = []
    const dropped = new Set<string>()
    this.#open(this.#root, context, out, this.#pity.tracked ? this.#pity : undefined, dropped)
    if (this.#pity.tracked) this.#pity.record(dropped)
    return out
  }

  /**
   * Opens the chest `count` times.
   * @example chest.openMany(10, player)
   */
  openMany(count: number, context?: C): Drop[][] {
    checkCount(count, 'openMany(count)')
    const out: Drop[][] = []
    for (let i = 0; i < count; i++) out.push(this.open(context))
    return out
  }

  /**
   * The chance of each top-level drop on the next pick, given the context
   * and the pity right now.
   * @example chest.odds(player) // { nothing: 0.3, gold: 0.5, gem: 0.2 }
   */
  odds(context?: C): Record<K, number> {
    const node = this.#root
    const available = this.#available(node, context)
    const none = new Set<number>()
    const base = this.#base(node, available, none)
    const forced = this.#pity.forced(base, available)
    const chances = forced !== -1 ? base.map((_, i) => (i === forced ? 1 : 0)) : this.#pity.chances(base, available)
    const out = {} as Record<K, number>
    node.entries.forEach((e, i) => {
      out[e.key as K] = chances[i] as number
    })
    return out
  }

  /**
   * Opens a copy of this chest many times on its own seed and reports, for
   * every item that came out, how often and how much, plus the longest dry run.
   * @example chest.simulate(100_000, { context: player }).drops.gold.amount
   */
  simulate(opens: number, options: SimulateOptions<C> = {}): LootSimulation {
    checkCount(opens, 'simulate(opens)', 100_000_000)
    const sim = new LootChest(simRng(this.#rng, options), this.#spec, { ...this.#options, state: { misses: {} } } as LootOptions<K>)
    const tally = new Tally(opens, [])
    for (let i = 0; i < opens; i++) {
      for (const d of sim.open(options.context)) tally.add(d.item, d.amount)
      tally.endOpen()
    }
    return tally.result()
  }

  /** The pity counters as plain JSON. Restore with `rng.loot(table, { ...options, state })`. */
  state(): LootState {
    return this.#pity.state()
  }
}
