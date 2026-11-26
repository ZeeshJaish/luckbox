import { describe, expect, it } from 'vitest'
import { type LootState, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const SPEC = { common: 80, rare: 18, epic: 2 }

describe('hard pity', () => {
  it('never lets a drop stay away longer than its pity', () => {
    const chest = luck('hard').loot(SPEC, { pity: { epic: 40 } })
    let wait = 0
    let longest = 0
    for (let i = 0; i < 50_000; i++) {
      if (chest.open() === 'epic') wait = 0
      else longest = Math.max(longest, ++wait)
    }
    expect(longest).toBeLessThanOrEqual(39)
    expect(longest).toBe(39) // and it really does get that unlucky sometimes
  })

  it('forces the rarest first when two pities land together', () => {
    const chest = luck('two').loot({ a: 1, b: 2, c: 997 }, { pity: { a: 3, b: 3 } })
    const seq = chest.openMany(9).filter((d) => d !== 'c')
    expect(seq.length).toBeGreaterThanOrEqual(4)
  })

  it('odds() shows 100% on the guaranteed open', () => {
    const chest = luck('show').loot({ win: 0, lose: 1 }, { pity: { win: 3 } })
    expect(chest.odds()).toEqual({ win: 0, lose: 1 })
    chest.openMany(2)
    expect(chest.odds()).toEqual({ win: 1, lose: 0 })
    expect(chest.open()).toBe('win')
    expect(chest.state()).toEqual({ misses: { win: 0 } })
  })
})

describe('soft pity', () => {
  it('raises the chance by `add` per open after `after` misses', () => {
    const chest = luck('soft').loot({ star5: 6, rest: 994 }, { softPity: { star5: { after: 3, add: 0.1 } }, state: { misses: { star5: 0 } } })
    const at = (misses: number): number =>
      luck('soft').loot({ star5: 6, rest: 994 }, { softPity: { star5: { after: 3, add: 0.1 } }, state: { misses: { star5: misses } } }).odds().star5
    expect(chest.odds().star5).toBeCloseTo(0.006, 12)
    expect(at(2)).toBeCloseTo(0.006, 12)
    expect(at(3)).toBeCloseTo(0.106, 12)
    expect(at(5)).toBeCloseTo(0.306, 12)
    expect(at(20)).toBe(1)
  })

  it('other drops share what is left in their usual proportions', () => {
    const chest = luck('share').loot({ a: 10, b: 30, c: 60 }, { softPity: { a: { after: 0, add: 0.5 } } })
    const odds = chest.odds() // a: 0.1 + 0.5 = 0.6, the other 0.4 splits 1:2
    expect(odds.a).toBeCloseTo(0.6, 12)
    expect(odds.b).toBeCloseTo(0.4 / 3, 12)
    expect(odds.c).toBeCloseTo(0.8 / 3, 12)
  })
})

describe('rates()', () => {
  it('equals the base chances without pity', () => {
    expect(luck('r').loot(SPEC).rates()).toEqual({ common: 0.8, rare: 0.18, epic: 0.02 })
  })

  it('matches a famous gacha: 0.6% base becomes about 1.6% with pity', () => {
    const banner = luck('g').loot(
      { star5: 6, star4: 51, star3: 943 },
      { pity: { star5: 90, star4: 10 }, softPity: { star5: { after: 73, add: 0.06 } } },
    )
    const rates = banner.rates()
    expect(rates.star5).toBeGreaterThan(0.0155)
    expect(rates.star5).toBeLessThan(0.0162)
    expect(rates.star5 + rates.star4 + rates.star3).toBeCloseTo(1, 10)
  })

  it.each([
    [{ a: 1, b: 9 }, { pity: { a: 5 } }],
    [{ a: 2, b: 30, c: 968 }, { pity: { a: 50, b: 8 } }],
    [{ a: 5, b: 95 }, { softPity: { a: { after: 4, add: 0.2 } } }],
    [{ a: 1, b: 49, c: 950 }, { pity: { a: 30 }, softPity: { a: { after: 20, add: 0.05 }, b: { after: 5, add: 0.1 } } }],
  ])('agrees with a 400,000-open simulation for %o', (spec, options) => {
    const chest = luck('agree').loot(spec as Record<string, number>, options as never)
    const exact = chest.rates()
    const sim = chest.simulate(400_000)
    for (const [k, r] of Object.entries(exact)) {
      const sd = Math.sqrt((r * (1 - r)) / 400_000)
      expect(Math.abs((sim.drops[k]?.rate ?? 0) - r)).toBeLessThan(5 * sd + 1e-4)
    }
  })

  it('says when a setup is too big to work out', () => {
    const big = luck('x').loot({ a: 1, b: 1, c: 1, d: 997 }, { pity: { a: 100, b: 100, c: 100 } })
    expectCode(() => big.rates(), 'BAD_ARGUMENT')
    expect(() => big.rates()).toThrow('Use simulate() instead')
  })
})

describe('simulate()', () => {
  it('reports counts, rates and the longest dry run', () => {
    const sim = luck('sim').loot(SPEC, { pity: { epic: 40 } }).simulate(100_000)
    expect(sim.opens).toBe(100_000)
    const epic = sim.drops.epic
    expect(epic?.count).toBeGreaterThan(2000)
    expect(epic?.longestWait).toBeLessThanOrEqual(39)
    expect((sim.drops.common?.count ?? 0) + (sim.drops.rare?.count ?? 0) + (epic?.count ?? 0)).toBe(100_000)
    expect(epic?.amount).toBe(epic?.count)
  })

  it('never moves the game Rng or its pity, and repeats for the same seed', () => {
    const rng = luck('untouched')
    const chest = rng.loot(SPEC, { pity: { epic: 40 } })
    chest.openMany(5)
    const before = [rng.draws, JSON.stringify(chest.state())]
    const a = chest.simulate(10_000, { seed: 'balance' })
    expect([rng.draws, JSON.stringify(chest.state())]).toEqual(before)
    expect(chest.simulate(10_000, { seed: 'balance' })).toEqual(a)
    expect(chest.simulate(10_000, { seed: 'other' })).not.toEqual(a)
    expect(chest.simulate(0).opens).toBe(0)
  })

  it('explains bad input', () => {
    const chest = luck('x').loot(SPEC)
    expectCode(() => chest.simulate(-1), 'BAD_ARGUMENT')
    expectCode(() => chest.simulate(1e9), 'BAD_ARGUMENT')
    expectCode(() => chest.simulate(10, { seed: 5 as unknown as string }), 'BAD_ARGUMENT')
    expectCode(() => chest.simulate(10, 'x' as unknown as object), 'BAD_ARGUMENT')
  })
})

describe('pity state', () => {
  it('saves and continues exactly', () => {
    const options = { pity: { epic: 40 }, softPity: { rare: { after: 3, add: 0.2 } } }
    const rng = luck('pity-save')
    const chest = rng.loot(SPEC, options)
    chest.openMany(25)
    const saved = JSON.parse(JSON.stringify({ rng: rng.state(), loot: chest.state() })) as { rng: never; loot: LootState }
    const expected = chest.openMany(100)
    const chest2 = luck.from(saved.rng).loot(SPEC, { ...options, state: saved.loot })
    expect(chest2.openMany(100)).toEqual(expected)
  })

  it('explains bad pity setups and saves', () => {
    const rng = luck('x')
    expectCode(() => rng.loot(SPEC, { pity: { legendary: 10 } as never }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { pity: { epic: 0 } }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { pity: { epic: 2.5 } }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { pity: 5 as never }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { softPity: { epic: { after: -1, add: 0.1 } } }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { softPity: { epic: { after: 1, add: 2 } } }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, { softPity: 'x' as never }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC, 'x' as never), 'BAD_ARGUMENT')
    expect(() => rng.loot({ ...SPEC, pity: { epic: 40 } } as never)).toThrow('put pity in the second argument')
    expectCode(() => rng.loot(SPEC, { pity: { epic: 40 }, state: { misses: { epic: 40 } } }), 'BAD_STATE')
    expectCode(() => rng.loot(SPEC, { pity: { epic: 40 }, state: { misses: { rare: 1 } } }), 'BAD_STATE')
    expectCode(() => rng.loot(SPEC, { pity: { epic: 40 }, state: { misses: null as never } }), 'BAD_STATE')
  })
})
