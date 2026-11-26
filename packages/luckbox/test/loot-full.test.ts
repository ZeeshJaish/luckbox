import { describe, expect, it } from 'vitest'
import { type FullLootSpec, LootChest, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

interface Player {
  level: number
}

describe('full loot tables', () => {
  it('give a list of drops with amounts', () => {
    const chest = luck('full').loot({ drops: { gold: { weight: 1, amount: [10, 50] } } })
    expect(chest).toBeInstanceOf(LootChest)
    for (let i = 0; i < 500; i++) {
      const [drop, ...rest] = chest.open()
      expect(rest).toEqual([])
      expect(drop?.item).toBe('gold')
      expect(drop?.amount).toBeGreaterThanOrEqual(10)
      expect(drop?.amount).toBeLessThanOrEqual(50)
    }
  })

  it('amounts can be fixed, a range, or dice', () => {
    const chest = luck('amounts').loot({
      rolls: 3,
      unique: true,
      drops: { fixed: { weight: 1, amount: 5 }, range: { weight: 1, amount: [1, 3] }, dice: { weight: 1, amount: '2d6*10' } },
    })
    for (let i = 0; i < 300; i++) {
      const byItem = Object.fromEntries(chest.open().map((d) => [d.item, d.amount]))
      expect(byItem.fixed).toBe(5)
      expect(byItem.range).toBeGreaterThanOrEqual(1)
      expect(byItem.range).toBeLessThanOrEqual(3)
      const dice = byItem.dice as number
      expect(dice % 10).toBe(0)
      expect(dice >= 20 && dice <= 120).toBe(true)
    }
  })

  it('"nothing" gives nothing', () => {
    const chest = luck('empty').loot({ drops: { nothing: 1 } })
    expect(chest.open()).toEqual([])
  })

  it('rolls: a fixed number or a range per open', () => {
    const three = luck('r').loot({ rolls: 3, drops: { a: 1, b: 1 } })
    for (let i = 0; i < 100; i++) expect(three.open()).toHaveLength(3)
    const some = luck('r').loot({ rolls: [0, 2], drops: { a: 1 } })
    const sizes = new Set(some.openMany(300).map((o) => o.length))
    expect([...sizes].sort()).toEqual([0, 1, 2])
  })

  it('unique: no drop twice in one open, and it stops when the pool runs out', () => {
    const chest = luck('u').loot({ rolls: 5, unique: true, drops: { a: 1, b: 1, c: 1 } })
    for (let i = 0; i < 200; i++) {
      const items = chest.open().map((d) => d.item)
      expect(items).toHaveLength(3)
      expect(new Set(items).size).toBe(3)
    }
  })

  it('always: drops added to every open', () => {
    const chest = luck('a').loot({ always: ['xp'], drops: { xp: { weight: 0, amount: 10 }, gold: 1 } })
    for (const open of chest.openMany(100)) {
      expect(open[0]).toEqual({ item: 'xp', amount: 10 })
      expect(open[1]?.item).toBe('gold')
    }
  })

  it('when: drops only for players who qualify', () => {
    const chest = luck('w').loot<'gem' | 'gold', Player>({
      drops: { gold: 1, gem: { weight: 1000, when: (p) => p.level >= 10 } },
    })
    for (let i = 0; i < 200; i++) expect(chest.open({ level: 5 })[0]?.item).toBe('gold')
    const high = chest.openMany(200, { level: 12 }).filter((o) => o[0]?.item === 'gem').length
    expect(high).toBeGreaterThan(190)
    expect(chest.odds({ level: 5 })).toEqual({ gold: 1, gem: 0 })
    expect(chest.odds({ level: 12 }).gem).toBeCloseTo(1000 / 1001, 12)
  })

  it('tables inside tables', () => {
    const chest = luck('nested').loot({
      drops: {
        bonus: { weight: 1, table: { rolls: 2, drops: { potion: 1, scroll: { weight: 1, amount: [1, 2] } } } },
      },
    })
    for (let i = 0; i < 100; i++) {
      const open = chest.open()
      expect(open).toHaveLength(2)
      for (const d of open) expect(['potion', 'scroll']).toContain(d.item)
    }
    const simple = luck('nested2').loot({ drops: { bag: { weight: 1, table: { apple: 1, pear: 1 } } } })
    expect(['apple', 'pear']).toContain(simple.open()[0]?.item)
  })

  it('odds add up to 1 and match the weights', () => {
    const odds = luck('o').loot({ drops: { nothing: 30, gold: 50, gem: 20 } }).odds()
    expect(odds).toEqual({ nothing: 0.3, gold: 0.5, gem: 0.2 })
  })

  it('drops at the stated rates, exactly for whole-number weights', () => {
    const chest = luck('rate').loot({ drops: { a: 1, b: 3 } })
    let a = 0
    for (let i = 0; i < 100_000; i++) if (chest.open()[0]?.item === 'a') a++
    expect(Math.abs(a / 100_000 - 0.25)).toBeLessThan(0.006)
    const decimal = luck('rate2').loot({ drops: { a: 0.25, b: 0.75 } })
    let d = 0
    for (let i = 0; i < 100_000; i++) if (decimal.open()[0]?.item === 'a') d++
    expect(Math.abs(d / 100_000 - 0.25)).toBeLessThan(0.006)
  })

  it('pity works in full tables too', () => {
    const chest = luck('fp').loot({ rolls: 1, drops: { nothing: 98, relic: 2 } }, { pity: { relic: 25 } })
    let wait = 0
    let longest = 0
    for (let i = 0; i < 20_000; i++) {
      if (chest.open().length > 0) wait = 0
      else longest = Math.max(longest, ++wait)
    }
    expect(longest).toBeLessThanOrEqual(24)
    const soft = luck('fs').loot({ drops: { nothing: 99, relic: 1 } }, { softPity: { relic: { after: 0, add: 0.5 } } })
    expect(soft.odds().relic).toBeCloseTo(0.51, 12)
    const saved = soft.state()
    expect(saved).toEqual({ misses: { relic: 0 } })
  })

  it('simulate() reports amounts and never touches the game Rng', () => {
    const rng = luck('fsim')
    const chest = rng.loot<'nothing' | 'gold' | 'gem', Player>({
      rolls: 2,
      drops: { nothing: 1, gold: { weight: 2, amount: [10, 20] }, gem: { weight: 1, when: (p) => p.level > 3 } },
    })
    const sim = chest.simulate(50_000, { context: { level: 5 } })
    expect(sim.drops.gold?.amount ?? 0).toBeGreaterThan((sim.drops.gold?.count ?? 0) * 10 - 1)
    expect((sim.drops.gold?.amount ?? 0) / (sim.drops.gold?.count ?? 1)).toBeCloseTo(15, 0)
    expect(sim.drops.gem?.count).toBeGreaterThan(0)
    expect(chest.simulate(1_000, { context: { level: 1 } }).drops.gem).toBeUndefined()
    expect(rng.draws).toBe(0)
  })

  it('same seed, same drops', () => {
    const spec: FullLootSpec = { rolls: [1, 3], drops: { a: 1, b: { weight: 2, amount: '1d6' }, c: { weight: 1, amount: [1, 9] } } }
    expect(luck('same').loot(spec).openMany(50)).toEqual(luck('same').loot(spec).openMany(50))
  })

  it('explains bad tables', () => {
    const rng = luck('x')
    const bad = (spec: unknown): (() => unknown) => () => rng.loot(spec as FullLootSpec)
    expectCode(bad({ drops: {} }), 'EMPTY_LIST')
    expectCode(bad({ drops: { a: 0 } }), 'EMPTY_LIST')
    expectCode(bad({ drops: [] }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: -1 } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: 'x' } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 'x' } } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, amount: -1 } } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, amount: [5, 1] } } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, amount: [1, 2, 3] } } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, amount: '2x' } } }), 'BAD_DICE')
    expectCode(bad({ drops: { a: { weight: 1, amount: {} } } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, when: true } } }), 'BAD_ARGUMENT')
    expectCode(bad({ rolls: -1, drops: { a: 1 } }), 'BAD_ARGUMENT')
    expectCode(bad({ rolls: [3, 1], drops: { a: 1 } }), 'BAD_ARGUMENT')
    expectCode(bad({ rolls: 'x', drops: { a: 1 } }), 'BAD_ARGUMENT')
    expectCode(bad({ always: ['zzz'], drops: { a: 1 } }), 'BAD_ARGUMENT')
    expectCode(bad({ drops: { a: { weight: 1, table: 5 } } }), 'BAD_ARGUMENT')
    let deep: FullLootSpec = { drops: { leaf: 1 } }
    for (let i = 0; i < 10; i++) deep = { drops: { next: { weight: 1, table: deep } } }
    expectCode(bad(deep), 'BAD_ARGUMENT')
    expect(bad({ drops: { a: { weight: 1, table: { drops: { b: -1 } } } } })).toThrow('(in a)')
    expectCode(() => rng.loot({ drops: { a: 1 } }).openMany(-1), 'BAD_ARGUMENT')
    expectCode(() => rng.loot({ drops: { a: 1 } }).simulate(5, null as never), 'BAD_ARGUMENT')
  })
})
