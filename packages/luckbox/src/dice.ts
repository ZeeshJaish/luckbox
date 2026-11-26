import { LuckboxError, show } from './errors.ts'

/*
 * Dice notation
 *
 *   2d6          two six-sided dice
 *   d20+5        one d20 plus 5
 *   4d6kh3       roll 4, keep the highest 3      (also: k3)
 *   2d20kl1      roll 2, keep the lowest 1       (disadvantage)
 *   4d6dl1       roll 4, drop the lowest 1       (also: dh1 drops the highest)
 *   3d6!         exploding: a max roll adds another roll to that die (up to 100 times)
 *   2d6r1        reroll 1s until they stop       (r<2 rerolls 1s and 2s)
 *   2d6ro1       reroll 1s once
 *   d%           a d100
 *   4dF          fudge dice: -1, 0 or +1 each
 *   5d4*10       multiply a group (or a number) by a whole number
 *   1d8+1d6-2    mix groups and numbers with + and -
 *
 * Case and spaces don't matter.
 */

const MAX_LENGTH = 500
const MAX_DICE = 1_000
const MAX_TOTAL_DICE = 10_000
const MAX_SIDES = 1_000_000
const MAX_MULTIPLIER = 1_000_000
const MAX_CONSTANT = 1_000_000_000
/** The most extra rolls one exploding die can add. */
export const MAX_EXPLOSIONS = 100
/** Work limit for exact odds, so a huge notation fails fast instead of freezing. */
const ODDS_BUDGET = 60_000_000

interface DiceGroup {
  kind: 'dice'
  text: string
  sign: 1 | -1
  count: number
  low: number
  high: number
  keep: { highest: boolean; count: number } | undefined
  explode: boolean
  reroll: { below: boolean; value: number; once: boolean } | undefined
  multiplier: number
}

interface Constant {
  kind: 'constant'
  text: string
  sign: 1 | -1
  value: number
}

type Part = DiceGroup | Constant

/** @internal A parsed notation. */
export interface ParsedDice {
  notation: string
  parts: Part[]
}

const EXAMPLES = 'Dice look like 2d6, 4d6kh3 or d20+5.'

class Parser {
  readonly original: string
  readonly src: string
  pos = 0

  constructor(original: string) {
    this.original = original
    this.src = original.toLowerCase().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[×x](?=\d)/g, '*')
  }

  fail(why: string): never {
    throw new LuckboxError('BAD_DICE', `bad dice ${show(this.original)}: ${why}`)
  }

  peek(offset = 0): string {
    return this.src[this.pos + offset] ?? ''
  }

  readInt(): number | undefined {
    const start = this.pos
    while (this.pos < this.src.length && this.src.charCodeAt(this.pos) >= 48 && this.src.charCodeAt(this.pos) <= 57) {
      this.pos++
    }
    if (this.pos === start) return undefined
    const digits = this.src.slice(start, this.pos)
    const n = Number(digits)
    if (!Number.isSafeInteger(n)) this.fail(`the number ${digits} is too big.`)
    return n
  }

  unexpected(): never {
    const before = this.src.slice(0, this.pos)
    this.fail(`unexpected "${this.peek()}"${before ? ` after "${before}"` : ' at the start'}. ${EXAMPLES}`)
  }

  parse(): ParsedDice {
    if (this.original.length > MAX_LENGTH) this.fail(`it is longer than ${MAX_LENGTH} characters.`)
    if (this.src === '') this.fail(`it is empty. ${EXAMPLES}`)
    // "2d6 3" must not quietly become "2d63": spaces may only sit around + - and *.
    const gap = /([\da-z%!<])\s+([\da-z%!<])/i.exec(this.original)
    if (gap) this.fail(`there is a space between "${gap[1]}" and "${gap[2]}". Spaces can only go around + and -.`)
    const parts: Part[] = []
    let sign: 1 | -1 = 1
    if (this.peek() === '+' || this.peek() === '-') {
      sign = this.peek() === '-' ? -1 : 1
      this.pos++
    }
    for (;;) {
      if (this.pos >= this.src.length) {
        this.fail(`it ends after "${this.src[this.pos - 1]}". Add a number or dice like 1d4.`)
      }
      parts.push(this.term(sign))
      if (this.pos >= this.src.length) break
      const op = this.peek()
      if (op !== '+' && op !== '-') this.unexpected()
      sign = op === '-' ? -1 : 1
      this.pos++
    }
    let dice = 0
    for (const p of parts) if (p.kind === 'dice') dice += p.count
    if (dice > MAX_TOTAL_DICE) this.fail(`it rolls ${dice} dice, more than the limit of ${MAX_TOTAL_DICE}.`)
    return { notation: this.original.trim(), parts }
  }

  multiplier(): number {
    if (this.peek() !== '*') return 1
    this.pos++
    const m = this.readInt()
    if (m === undefined) this.fail('"*" needs a whole number after it, like *10.')
    if (m < 1 || m > MAX_MULTIPLIER) this.fail(`multiply by a whole number from 1 to ${MAX_MULTIPLIER.toLocaleString('en-US')}, not ${m}.`)
    return m
  }

  term(sign: 1 | -1): Part {
    const start = this.pos
    const n = this.readInt()
    if (this.peek() !== 'd') {
      if (n === undefined) this.unexpected()
      if (n > MAX_CONSTANT) this.fail(`the number ${n} is too big (the limit is ${MAX_CONSTANT.toLocaleString('en-US')}).`)
      const value = n * this.multiplier()
      return { kind: 'constant', text: this.src.slice(start, this.pos), sign, value }
    }
    this.pos++ // the "d"
    const count = n ?? 1
    if (count < 1) this.fail(`it needs at least 1 die (like 1d6), not ${count}.`)
    if (count > MAX_DICE) this.fail(`${count} dice is too many for one group (the limit is ${MAX_DICE.toLocaleString('en-US')}).`)

    let low = 1
    let high: number
    if (this.peek() === '%') {
      this.pos++
      high = 100
    } else if (this.peek() === 'f') {
      this.pos++
      low = -1
      high = 1
    } else {
      const sides = this.readInt()
      if (sides === undefined) this.fail('"d" needs a number of sides after it, like d6 or d20.')
      if (sides < 1) this.fail(`a die needs at least 1 side, not ${sides}.`)
      if (sides > MAX_SIDES) this.fail(`d${sides} has too many sides (the limit is ${MAX_SIDES.toLocaleString('en-US')}).`)
      high = sides
    }
    const fudge = low === -1
    const name = fudge ? 'dF' : `d${high}`

    let keep: DiceGroup['keep']
    let explode = false
    let reroll: DiceGroup['reroll']
    for (;;) {
      const c = this.peek()
      const c2 = this.peek(1)
      if (c === 'k' || (c === 'd' && (c2 === 'h' || c2 === 'l'))) {
        if (keep) this.fail('use only one keep or drop rule per group of dice.')
        const drop = c === 'd'
        const highest = drop ? c2 === 'l' : c2 !== 'l'
        this.pos += c2 === 'h' || c2 === 'l' ? 2 : 1
        const k = this.readInt() ?? 1
        if (drop) {
          if (k >= count) this.fail(`can't drop ${k} of ${count} dice: at least one must stay.`)
          keep = { highest, count: count - k }
        } else {
          if (k < 1 || k > count) this.fail(`can't keep ${k} of ${count} dice.`)
          keep = { highest, count: k }
        }
        continue
      }
      if (c === '!') {
        if (explode) this.fail('use "!" only once per group of dice.')
        this.pos++
        if (fudge) this.fail('fudge dice (dF) cannot explode.')
        if (high === 1) this.fail('d1! would explode forever, because a d1 always rolls its highest face.')
        explode = true
        continue
      }
      if (c === 'r') {
        if (reroll) this.fail('use only one reroll rule per group of dice.')
        this.pos++
        const once = this.peek() === 'o'
        if (once) this.pos++
        const below = this.peek() === '<'
        if (below) this.pos++
        if (fudge) this.fail('fudge dice (dF) cannot be rerolled.')
        const value = this.readInt()
        if (value === undefined) this.fail('"r" needs a face to reroll, like r1 or r<2.')
        const rule = `r${once ? 'o' : ''}${below ? '<' : ''}${value}`
        if (value < low || (!below && value > high)) this.fail(`${rule} can never happen on a ${name}.`)
        const faces = below ? Math.min(value, high) - low + 1 : 1
        if (!once && faces >= high - low + 1) {
          this.fail(`${rule} rerolls every face of a ${name}, so it would never stop. Use ro for a single reroll.`)
        }
        reroll = { below, value, once }
        continue
      }
      break
    }
    const multiplier = this.multiplier()
    return {
      kind: 'dice',
      text: this.src.slice(start, this.pos).replace('df', 'dF'),
      sign,
      count,
      low,
      high,
      keep,
      explode,
      reroll,
      multiplier,
    }
  }
}

const parsedCache = new Map<string, ParsedDice>()

/** @internal Parses (and caches) a notation. */
export function parseDice(notation: string): ParsedDice {
  if (typeof notation !== 'string') {
    throw new LuckboxError('BAD_DICE', `dice notation must be text like '2d6+3', got ${show(notation)}.`)
  }
  let parsed = parsedCache.get(notation)
  if (!parsed) {
    parsed = new Parser(notation).parse()
    if (parsedCache.size >= 500) parsedCache.clear()
    parsedCache.set(notation, parsed)
  }
  return parsed
}

// ---------------------------------------------------------------- rolling

/** One die in a roll. */
export interface Die {
  /** What this die counts for: its face, plus any explosion rolls. */
  value: number
  /** `false` if a keep or drop rule threw this die away. */
  kept: boolean
  /** The faces that count, in order: the first face, then any explosion rolls. */
  rolls: number[]
  /** Faces thrown away by a reroll rule, in order. */
  rerolled: number[]
}

/** One group of dice in a roll, like the `4d6kh3` in `4d6kh3+2`. */
export interface DiceGroupRoll {
  /** This group's notation. */
  notation: string
  /** `-1` if the group is subtracted. */
  sign: 1 | -1
  /** The `*N` multiplier (1 if none). */
  multiplier: number
  /** Every die, in the order rolled. */
  dice: Die[]
  /** This group's part of the total (kept dice, times multiplier, with its sign). */
  total: number
}

/** The full story of a roll: every die, what was kept, and the total. */
export interface DiceRoll {
  /** The notation that was rolled. */
  notation: string
  /** The final result. */
  total: number
  /** Each group of dice. */
  groups: DiceGroupRoll[]
  /** The sum of the plain numbers, like the +2 in `4d6kh3+2`. */
  modifier: number
  /** A readable line for logs and chat, like `4d6kh3 (6, 5, 1 dropped, 3) + 2 = 16`. */
  text: string
}

/** @internal Draws a whole number from low to high, both included. */
export type FaceFn = (low: number, high: number) => number

/**
 * Rolls one die with its reroll and explode rules. Pass arrays to record the
 * faces; pass undefined to skip that work (roll() does, dice() doesn't).
 * Either way the same numbers are drawn in the same order.
 */
function rollOne(g: DiceGroup, face: FaceFn, rolls?: number[], rerolled?: number[]): number {
  let first = face(g.low, g.high)
  const r = g.reroll
  if (r) {
    if (r.once) {
      if (r.below ? first <= r.value : first === r.value) {
        rerolled?.push(first)
        first = face(g.low, g.high)
      }
    } else {
      while (r.below ? first <= r.value : first === r.value) {
        rerolled?.push(first)
        first = face(g.low, g.high)
      }
    }
  }
  rolls?.push(first)
  let value = first
  if (g.explode) {
    let last = first
    let extra = 0
    while (last === g.high && extra < MAX_EXPLOSIONS) {
      last = face(g.low, g.high)
      rolls?.push(last)
      value += last
      extra++
    }
  }
  return value
}

function rollGroup(g: DiceGroup, face: FaceFn): DiceGroupRoll {
  const dice: Die[] = []
  for (let i = 0; i < g.count; i++) {
    const rolls: number[] = []
    const rerolled: number[] = []
    const value = rollOne(g, face, rolls, rerolled)
    dice.push({ value, kept: true, rolls, rerolled })
  }
  let sum = 0
  if (g.keep && g.keep.count < g.count) {
    const highest = g.keep.highest
    const order = dice.map((_, i) => i)
    order.sort((a, b) => {
      const va = (dice[a] as Die).value
      const vb = (dice[b] as Die).value
      return va === vb ? a - b : highest ? vb - va : va - vb
    })
    for (let i = g.keep.count; i < order.length; i++) (dice[order[i] as number] as Die).kept = false
  }
  for (const d of dice) if (d.kept) sum += d.value
  const total = sum === 0 ? 0 : g.sign * g.multiplier * sum
  return { notation: g.text, sign: g.sign, multiplier: g.multiplier, dice, total }
}

function dieText(d: Die): string {
  const first = d.rerolled.length ? `${d.rerolled.join('→')}→${d.rolls[0]}` : String(d.rolls[0])
  const rest = d.rolls.slice(1)
  const shown = rest.length ? `${first}!+${rest.join('!+')}` : first
  return d.kept ? shown : `${shown} dropped`
}

/** @internal Rolls a parsed notation. */
export function rollDice(parsed: ParsedDice, face: FaceFn): DiceRoll {
  const groups: DiceGroupRoll[] = []
  let total = 0
  let modifier = 0
  let text = ''
  for (const part of parsed.parts) {
    const op = part.sign === -1 ? '-' : '+'
    const joiner = text === '' ? (part.sign === -1 ? '-' : '') : ` ${op} `
    if (part.kind === 'constant') {
      const v = part.sign * part.value
      modifier += v
      total += v
      text += `${joiner}${part.text}`
    } else {
      const g = rollGroup(part, face)
      groups.push(g)
      total += g.total
      text += `${joiner}${part.text} (${g.dice.map(dieText).join(', ')})`
    }
  }
  total += 0 // turns -0 into 0
  modifier += 0
  return { notation: parsed.notation, total, groups, modifier, text: `${text} = ${total}` }
}

/** @internal Just the total, for `roll()`: same draws as rollDice, less work. */
export function rollTotal(parsed: ParsedDice, face: FaceFn): number {
  let total = 0
  for (const part of parsed.parts) {
    if (part.kind === 'constant') {
      total += part.sign * part.value
      continue
    }
    let sum = 0
    if (part.keep && part.keep.count < part.count) {
      const values = new Array<number>(part.count)
      for (let i = 0; i < part.count; i++) values[i] = rollOne(part, face)
      values.sort(part.keep.highest ? (a, b) => b - a : (a, b) => a - b)
      for (let i = 0; i < part.keep.count; i++) sum += values[i] as number
    } else {
      for (let i = 0; i < part.count; i++) sum += rollOne(part, face)
    }
    total += part.sign * part.multiplier * sum
  }
  return total + 0
}

// ---------------------------------------------------------------- exact odds

/** The exact chance of every total a notation can roll. */
export interface DiceOdds {
  /** The notation these odds are for. */
  readonly notation: string
  /** The lowest possible total. */
  readonly min: number
  /** The highest possible total. */
  readonly max: number
  /** The average total over many rolls. */
  readonly mean: number
  /** Every possible total with its chance (0 to 1), lowest first. */
  readonly totals: ReadonlyArray<{ readonly total: number; readonly chance: number }>
  /** The chance of rolling exactly this total. */
  chance(total: number): number
  /** The chance of rolling this total or more. */
  atLeast(total: number): number
  /** The chance of rolling this total or less. */
  atMost(total: number): number
}

type Dist = Map<number, number>

class Budget {
  used = 0
  readonly notation: string
  constructor(notation: string) {
    this.notation = notation
  }
  spend(n: number): void {
    this.used += n
    if (this.used > ODDS_BUDGET) {
      throw new LuckboxError(
        'BAD_DICE',
        `bad dice ${show(this.notation)}: it has too many possible totals to work out exactly. Roll it many times instead.`,
      )
    }
  }
}

function add(d: Dist, value: number, p: number): void {
  d.set(value, (d.get(value) ?? 0) + p)
}

function convolve(a: Dist, b: Dist, budget: Budget): Dist {
  budget.spend(a.size * b.size)
  const out: Dist = new Map()
  for (const [va, pa] of a) for (const [vb, pb] of b) add(out, va + vb, pa * pb)
  return out
}

/** The odds for one die of a group, after its reroll and explode rules. */
function dieDist(g: DiceGroup, budget: Budget): Dist {
  const sides = g.high - g.low + 1
  const base: Dist = new Map()
  const r = g.reroll
  if (!r) {
    for (let f = g.low; f <= g.high; f++) base.set(f, 1 / sides)
  } else {
    const hit = (f: number): boolean => (r.below ? f <= r.value : f === r.value)
    let hits = 0
    for (let f = g.low; f <= g.high; f++) if (hit(f)) hits++
    for (let f = g.low; f <= g.high; f++) {
      const p = r.once ? (hit(f) ? 0 : 1 / sides) + (hits / sides) * (1 / sides) : hit(f) ? 0 : 1 / (sides - hits)
      if (p > 0) base.set(f, p)
    }
  }
  if (!g.explode) return base
  budget.spend(sides * MAX_EXPLOSIONS)
  const out: Dist = new Map()
  for (const [f, p] of base) if (f !== g.high) add(out, f, p)
  // A max first roll starts a chain: j more max rolls, then a lower face ends it.
  let reach = base.get(g.high) ?? 0
  for (let j = 0; j < MAX_EXPLOSIONS && reach / sides > 0; j++) {
    for (let f = g.low; f < g.high; f++) add(out, g.high * (j + 1) + f, reach / sides)
    reach /= sides
  }
  if (reach > 0) add(out, g.high * (MAX_EXPLOSIONS + 1), reach)
  return out
}

const logFactorials: number[] = [0]
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = (logFactorials[i - 1] as number) + Math.log(i)
  return logFactorials[n] as number
}

/** Binomial probabilities P(c of m) for c = 0..m, with success chance 0 < q ≤ 1. */
function binomialRow(m: number, q: number): number[] {
  const row = new Array<number>(m + 1).fill(0)
  if (q >= 1) row[m] = 1
  else {
    const lq = Math.log(q)
    const lr = Math.log1p(-q)
    const lm = logFactorial(m)
    for (let c = 0; c <= m; c++) row[c] = Math.exp(lm - logFactorial(c) - logFactorial(m - c) + c * lq + (m - c) * lr)
  }
  return row
}

/**
 * Odds of the sum of the best (or worst) k of n dice. Faces are handed out
 * from the best value down; the first k dice handed out are the kept ones.
 * Each step uses the chance of a face given that the die isn't better.
 */
function keepDist(die: Dist, n: number, k: number, highest: boolean, budget: Budget): Dist {
  const faces = [...die.entries()].sort((a, b) => (highest ? b[0] - a[0] : a[0] - b[0]))
  let dp: Dist[] = Array.from({ length: n + 1 }, (): Dist => new Map())
  ;(dp[0] as Dist).set(0, 1)
  let left = 1
  faces.forEach(([v, p], index) => {
    // The last face takes every die left; rounding can never strand one.
    const q = index === faces.length - 1 || left <= p ? 1 : p / left
    left -= p
    const rows = new Map<number, number[]>()
    const next: Dist[] = Array.from({ length: n + 1 }, (): Dist => new Map())
    for (let assigned = 0; assigned <= n; assigned++) {
      const here = dp[assigned] as Dist
      if (here.size === 0) continue
      const m = n - assigned
      let row = rows.get(m)
      if (!row) {
        row = binomialRow(m, q)
        rows.set(m, row)
      }
      budget.spend(here.size * (m + 1))
      const keepRoom = Math.max(0, k - assigned)
      for (const [sum, pr] of here) {
        for (let c = 0; c <= m; c++) {
          const w = row[c] as number
          if (w === 0) continue
          add(next[assigned + c] as Dist, sum + Math.min(c, keepRoom) * v, pr * w)
        }
      }
    }
    dp = next
  })
  return dp[n] as Dist
}

function groupDist(g: DiceGroup, budget: Budget): Dist {
  const die = dieDist(g, budget)
  let sum: Dist
  if (g.keep && g.keep.count < g.count) {
    sum = keepDist(die, g.count, g.keep.count, g.keep.highest, budget)
  } else {
    sum = new Map([[0, 1]])
    for (let i = 0; i < g.count; i++) sum = convolve(sum, die, budget)
  }
  if (g.multiplier === 1 && g.sign === 1) return sum
  const out: Dist = new Map()
  for (const [v, p] of sum) add(out, v === 0 ? 0 : g.sign * g.multiplier * v, p)
  return out
}

function makeOdds(notation: string, dist: Dist): DiceOdds {
  const totals = [...dist.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([total, chance]) => Object.freeze({ total, chance }))
  const values = totals.map((t) => t.total)
  const prefix: number[] = [0]
  let mean = 0
  for (const t of totals) {
    prefix.push((prefix[prefix.length - 1] as number) + t.chance)
    mean += t.total * t.chance
  }
  const suffix: number[] = new Array<number>(totals.length + 1).fill(0)
  for (let i = totals.length - 1; i >= 0; i--) suffix[i] = (suffix[i + 1] as number) + (totals[i] as { chance: number }).chance
  /** How many totals are below `x`. */
  const below = (x: number): number => {
    let lo = 0
    let hi = values.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if ((values[mid] as number) < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const clamp = (p: number): number => Math.min(1, Math.max(0, p))
  const check = (total: number, method: string): void => {
    if (typeof total !== 'number' || Number.isNaN(total)) {
      throw new LuckboxError('BAD_ARGUMENT', `odds.${method}(total) needs a number, got ${show(total)}.`)
    }
  }
  return Object.freeze({
    notation,
    min: values[0] as number,
    max: values[values.length - 1] as number,
    mean,
    totals: Object.freeze(totals),
    chance(total: number): number {
      check(total, 'chance')
      return dist.get(total) ?? 0
    },
    atLeast(total: number): number {
      check(total, 'atLeast')
      const i = below(total)
      return i === 0 ? 1 : clamp(suffix[i] as number)
    },
    atMost(total: number): number {
      check(total, 'atMost')
      const i = below(Math.floor(total) + 1)
      return i === values.length ? 1 : clamp(prefix[i] as number)
    },
  })
}

const oddsCache = new Map<string, DiceOdds>()

/** @internal Exact odds for a notation. */
export function diceOdds(notation: string): DiceOdds {
  const parsed = parseDice(notation)
  let odds = oddsCache.get(parsed.notation)
  if (odds) return odds
  const budget = new Budget(parsed.notation)
  let dist: Dist = new Map([[0, 1]])
  for (const part of parsed.parts) {
    if (part.kind === 'constant') {
      const shift = part.sign * part.value
      const moved: Dist = new Map()
      for (const [v, p] of dist) moved.set(v + shift + 0, p)
      dist = moved
    } else {
      dist = convolve(dist, groupDist(part, budget), budget)
    }
  }
  odds = makeOdds(parsed.notation, dist)
  if (oddsCache.size >= 200) oddsCache.clear()
  oddsCache.set(parsed.notation, odds)
  return odds
}
