import { describe, expect, it } from 'vitest'
import { Gacha, type GachaSpec, type GachaState, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const BANNER = {
  rates: { star5: 6, star4: 51, star3: 943 },
  pity: { star5: 90, star4: 10 },
  softPity: { star5: { after: 73, add: 0.06 } },
  pools: {
    star5: { featured: ['Nova'], standard: ['Ash', 'Bryn', 'Cato', 'Dara', 'Eira'] },
    star4: { featured: ['Fen', 'Gale', 'Hoku'], standard: ['Iris', 'Jax', 'Kai', 'Lumi'] },
    star3: { standard: ['Sword', 'Bow', 'Staff', 'Shield'] },
  },
  spark: { cost: 300 },
} satisfies GachaSpec<'star5' | 'star4' | 'star3'>

describe('rng.gacha()', () => {
  it('pulls rarities and items from the right pools', () => {
    const banner = luck('pools').gacha(BANNER)
    expect(banner).toBeInstanceOf(Gacha)
    for (const p of banner.pullMany(2_000)) {
      const pool = BANNER.pools[p.rarity]
      const list: readonly string[] = p.featured ? ('featured' in pool ? pool.featured : []) : pool.standard
      expect(list).toContain(p.item)
      expect(p.pity).toBeGreaterThanOrEqual(1)
    }
  })

  it('reports which pull since the last drop each result was', () => {
    const banner = luck('pity-count').gacha({ rates: { win: 0, lose: 1 }, pity: { win: 5 } })
    const seq = banner.pullMany(10)
    expect(seq.map((p) => p.rarity)).toEqual(['lose', 'lose', 'lose', 'lose', 'win', 'lose', 'lose', 'lose', 'lose', 'win'])
    expect(seq[4]?.pity).toBe(5)
    expect(seq[5]?.pity).toBe(2) // 'lose' last dropped on pull 4, so pull 6 is its 2nd since
    expect(seq[4]?.item).toBe('win') // no pool: the rarity is the item
  })

  it('keeps hard pity: never more than 89 pulls without a 5★', () => {
    const banner = luck('hard').gacha(BANNER)
    let wait = 0
    for (const p of banner.pullMany(60_000)) {
      if (p.rarity === 'star5') wait = 0
      else expect(++wait).toBeLessThan(90)
    }
  })

  it('the 50/50: after losing, the next drop of that rarity is always featured', () => {
    const banner = luck('fifty').gacha(BANNER)
    let lostLast = false
    let checked = 0
    for (let i = 0; i < 80_000; i++) {
      const p = banner.pull()
      if (p.rarity !== 'star5') continue
      if (lostLast) {
        expect(p.featured).toBe(true)
        checked++
      }
      lostLast = !p.featured
      expect(banner.isGuaranteed('star5')).toBe(!p.featured)
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('featured share in the long run is 1 / (2 − p): ⅔ for a 50/50 with guarantee', () => {
    const sim = luck('share').gacha(BANNER).simulate(1_000_000)
    const n = sim.rarities.star5?.count ?? 0
    const sd = Math.sqrt((2 / 9) / n)
    expect(Math.abs((sim.featuredShare.star5 ?? 0) - 2 / 3)).toBeLessThan(5 * sd)
    const noGuarantee = luck('share').gacha({ ...BANNER, pools: { ...BANNER.pools, star5: { ...BANNER.pools.star5, guarantee: false, featuredChance: 0.75 } } })
    const sim2 = noGuarantee.simulate(1_000_000)
    expect(Math.abs((sim2.featuredShare.star5 ?? 0) - 0.75)).toBeLessThan(0.02)
  })

  it('itemRates() matches a simulation and adds up to 1', () => {
    const banner = luck('items').gacha(BANNER)
    const rates = banner.itemRates()
    expect(Math.abs(rates.reduce((s, r) => s + r.rate, 0) - 1)).toBeLessThan(1e-12)
    const nova = rates.find((r) => r.item === 'Nova')?.rate ?? 0
    expect(nova).toBeCloseTo(banner.rates().star5 / (2 - 0.5), 12)
    const sim = banner.simulate(1_000_000)
    for (const { item, rate } of rates) {
      const got = (sim.items[item] ?? 0) / 1_000_000
      expect(Math.abs(got - rate)).toBeLessThan(5 * Math.sqrt((rate * (1 - rate)) / 1_000_000) + 2e-4)
    }
  })

  it('a rarity with only featured items is always featured; featuredChance 1 always wins', () => {
    const banner = luck('only').gacha({ rates: { a: 1, b: 1 }, pools: { a: { featured: ['A1'] }, b: { featured: ['B1'], standard: ['B2'], featuredChance: 1 } } })
    for (const p of banner.pullMany(500)) expect(p.featured).toBe(true)
    expect(banner.itemRates().find((r) => r.item === 'B2')?.rate).toBe(0)
  })

  it('spark: earns a point per pull and buys a chosen item', () => {
    const banner = luck('spark').gacha(BANNER)
    banner.pullMany(299)
    expect(banner.sparks).toBe(299)
    expectCode(() => banner.redeem('Nova'), 'BAD_ARGUMENT') // not enough yet
    banner.pull()
    expect(banner.redeem('Nova')).toEqual({ rarity: 'star5', item: 'Nova', featured: true, pity: 0, redeemed: true })
    expect(banner.sparks).toBe(0)
    expect(banner.totalPulls).toBe(300)
    expectCode(() => banner.redeem('Sword'), 'BAD_ARGUMENT') // not a spark item
    const noSpark = luck('x').gacha({ rates: { a: 1 } })
    expectCode(() => noSpark.redeem('a'), 'BAD_ARGUMENT')
    noSpark.pullMany(3)
    expect(noSpark.sparks).toBe(0)
    const custom = luck('x').gacha({ ...BANNER, spark: { cost: 1, items: ['Iris'] } })
    custom.pull()
    expect(custom.redeem('Iris')).toMatchObject({ rarity: 'star4', featured: false })
  })

  it('disclosure() lists base and real rates, pity and featured rules', () => {
    const d = luck('d').gacha(BANNER).disclosure()
    expect(d.rarities.map((r) => r.rarity)).toEqual(['star5', 'star4', 'star3'])
    expect(d.rarities[0]?.baseRate).toBeCloseTo(0.006, 12)
    expect(d.rarities[0]?.hardPity).toBe(90)
    expect(d.rarities[0]?.softPity).toEqual({ after: 73, add: 0.06 })
    expect(d.items).toHaveLength(17)
    const text = d.rules.join('\n')
    expect(text).toContain('star5: 0.60% base chance per pull, 1.58% overall including pity. Guaranteed by pull 90 at the latest. From pull 74')
    expect(text).toContain('50.00% chance the item is featured (Nova). If it isn\'t, the next star5 is guaranteed featured.')
    expect(text).toContain('Spark: every pull earns 1 point; 300 points buy one of: Nova, Fen, Gale, Hoku.')
    expect(text).toContain('star3: 94.30% base chance per pull, 85.94% overall.')
  })

  it('odds() and rates() follow the rarity table', () => {
    const banner = luck('o').gacha(BANNER)
    expect(banner.odds().star5).toBeCloseTo(0.006, 12)
    expect(banner.rarities).toEqual(['star5', 'star4', 'star3'])
    expect(banner.rates().star5).toBeGreaterThan(0.0155)
  })

  it('saves and continues exactly: pity, 50/50 guarantee, spark and counters', () => {
    const rng = luck('save')
    const banner = rng.gacha(BANNER)
    banner.pullMany(137)
    const saved = JSON.parse(JSON.stringify({ rng: rng.state(), banner: banner.state() })) as { rng: never; banner: GachaState }
    const expected = banner.pullMany(300)
    const again = luck.from(saved.rng).gacha(BANNER, { state: saved.banner })
    expect(again.pullMany(300)).toEqual(expected)
    expect(again.sparks).toBe(banner.sparks)
    expect(again.totalPulls).toBe(banner.totalPulls)
  })

  it('simulate() never touches the game, and repeats per seed', () => {
    const rng = luck('sim')
    const banner = rng.gacha(BANNER)
    banner.pullMany(3)
    const before = [rng.draws, JSON.stringify(banner.state())]
    const a = banner.simulate(5_000, { seed: 'x' })
    expect([rng.draws, JSON.stringify(banner.state())]).toEqual(before)
    expect(banner.simulate(5_000, { seed: 'x' })).toEqual(a)
    expect(banner.simulate(0).pulls).toBe(0)
    expect(banner.simulate(0).featuredShare.star5).toBe(0)
  })

  it('explains mistakes', () => {
    const rng = luck('x')
    const bad = (spec: unknown, options?: unknown): (() => unknown) => () => rng.gacha(spec as GachaSpec, options as never)
    expectCode(bad(null), 'BAD_ARGUMENT')
    expectCode(bad({}), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 } }, 'x'), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: 5 }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: { b: { standard: ['x'] } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: { a: 'x' } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: { a: {} } }), 'EMPTY_LIST')
    expectCode(bad({ rates: { a: 1 }, pools: { a: { standard: 'x' } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: { a: { standard: [''] } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, pools: { a: { standard: ['x'], featuredChance: 2 } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1, b: 1 }, pools: { a: { standard: ['x'] }, b: { standard: ['x'] } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, spark: { cost: 0 } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: 1 }, spark: { cost: 5 } }), 'EMPTY_LIST') // no featured items to buy
    expectCode(bad({ rates: { a: 1 }, spark: { cost: 5, items: ['nope'] } }), 'BAD_ARGUMENT')
    expectCode(bad({ rates: { a: -1 } }), 'BAD_ARGUMENT')
    const banner = rng.gacha(BANNER)
    expectCode(() => banner.pullMany(-1), 'BAD_ARGUMENT')
    expectCode(() => banner.isGuaranteed('star9' as 'star5'), 'BAD_ARGUMENT')
    expectCode(() => banner.simulate(1.5), 'BAD_ARGUMENT')
    expectCode(() => banner.simulate(5, { seed: 5 as unknown as string }), 'BAD_ARGUMENT')
    const good = (): GachaState => rng.gacha(BANNER).state()
    for (const state of [
      null,
      { ...good(), since: null },
      { ...good(), since: { star9: 1 } },
      { ...good(), since: { star5: -1 } },
      { ...good(), guaranteed: { star9: true } },
      { ...good(), guaranteed: { star5: 'yes' } },
      { ...good(), sparks: -1 },
      { ...good(), pulls: 1.5 },
    ]) {
      expectCode(() => rng.gacha(BANNER, { state: state as GachaState }), 'BAD_STATE')
    }
  })
})
