import { describe, expect, it } from 'vitest'
import { type Rng, WeightedTable, luck } from '../src/index.ts'
import { CHI_001, chiSquare, expectCode } from './helpers.ts'

/**
 * A stand-in Rng that walks through every (column, threshold) pair, so we
 * can count exactly how often each item would be picked.
 */
function everyPick<T>(table: WeightedTable<T>): Map<T, number> {
  const counts = new Map<T, number>()
  const n = table.size
  for (let column = 0; column < n; column++) {
    for (let r = 0; r < table.total; r++) {
      const answers = n === 1 ? [r] : [column, r]
      const fake = { int: () => answers.shift() as number } as unknown as Rng
      const item = table.pick(fake)
      counts.set(item, (counts.get(item) ?? 0) + 1)
    }
  }
  return counts
}

describe('weighted picks are exact for whole-number weights', () => {
  it.each([
    [{ a: 1, b: 2, c: 3, d: 94 }],
    [{ x: 7, y: 0, z: 3 }],
    [{ gold: 70, gem: 25, crown: 5 }],
    [{ only: 9 }],
    [{ a: 13, b: 1, c: 1, d: 1, e: 29, f: 2, g: 53 }],
  ] as Array<[Record<string, number>]>)('%o', (weights) => {
    const table = luck.weights(weights)
    const counts = everyPick(table)
    for (const [item, w] of Object.entries(weights)) expect(counts.get(item) ?? 0).toBe(w * table.size)
  })

  it('random tables too', () => {
    const rng = luck('tables')
    for (let t = 0; t < 30; t++) {
      const weights: Record<string, number> = {}
      const n = rng.int(1, 12)
      for (let i = 0; i < n; i++) weights[`item${i}`] = rng.int(0, 40)
      if (Object.values(weights).every((w) => w === 0)) weights.item0 = 1
      const table = luck.weights(weights)
      const counts = everyPick(table)
      for (const [item, w] of Object.entries(weights)) expect(counts.get(item) ?? 0).toBe(w * table.size)
    }
  })
})

describe('rng.weighted()', () => {
  it('takes { name: weight }', () => {
    const pick: 'gold' | 'gem' | 'crown' = luck('w').weighted({ gold: 70, gem: 25, crown: 5 })
    expect(['gold', 'gem', 'crown']).toContain(pick)
  })

  it('takes [item, weight] pairs, for items that are not text', () => {
    const sword = { name: 'sword' }
    const shield = { name: 'shield' }
    const pick = luck('w').weighted([[sword, 3], [shield, 1]] as const)
    expect([sword, shield]).toContain(pick)
  })

  it('takes (items, item => weight)', () => {
    const enemies = [{ kind: 'slime', w: 10 }, { kind: 'bat', w: 5 }, { kind: 'boss', w: 0 }]
    const rng = luck('w')
    for (let i = 0; i < 500; i++) expect(rng.weighted(enemies, (e) => e.w).kind).not.toBe('boss')
  })

  it('takes a ready-made table, giving the same result as table.pick', () => {
    const table = luck.weights({ a: 1, b: 2, c: 3 })
    const a = luck('same')
    const b = luck('same')
    for (let i = 0; i < 200; i++) expect(a.weighted(table)).toBe(table.pick(b))
    const c = luck('same')
    const d = luck('same')
    for (let i = 0; i < 200; i++) expect(c.weighted({ a: 1, b: 2, c: 3 })).toBe(table.pick(d))
  })

  it('never picks weight 0', () => {
    const rng = luck('zero')
    for (let i = 0; i < 2_000; i++) expect(rng.weighted({ never: 0, yes: 1, also: 2 })).not.toBe('never')
  })

  it('works with decimal weights', () => {
    const rng = luck('decimal')
    const counts = { a: 0, b: 0, c: 0 }
    const n = 100_000
    for (let i = 0; i < n; i++) counts[rng.weighted({ a: 0.1, b: 0.2, c: 0.7 })]++
    expect(Math.abs(counts.a / n - 0.1)).toBeLessThan(0.005)
    expect(Math.abs(counts.b / n - 0.2)).toBeLessThan(0.005)
    expect(Math.abs(counts.c / n - 0.7)).toBeLessThan(0.005)
  })

  it('still works when whole-number weights are too big to be exact', () => {
    const rng = luck('huge')
    let a = 0
    for (let i = 0; i < 20_000; i++) if (rng.weighted({ a: 2 ** 52, b: 2 ** 52 }) === 'a') a++
    expect(Math.abs(a / 20_000 - 0.5)).toBeLessThan(0.02)
  })

  it('is fair across many equal items', () => {
    const rng = luck('fair')
    const weights = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`i${i}`, 1]))
    const counts = new Map<string, number>()
    for (let i = 0; i < 64_000; i++) {
      const k = rng.weighted(weights)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    expect(chiSquare([...counts.values()])).toBeLessThan(CHI_001[15] as number)
  })

  it('explains bad weights', () => {
    const rng = luck('x')
    expectCode(() => rng.weighted({}), 'EMPTY_LIST')
    expectCode(() => rng.weighted([]), 'EMPTY_LIST')
    expectCode(() => rng.weighted({ a: 0, b: 0 }), 'EMPTY_LIST')
    expectCode(() => rng.weighted({ a: -1 }), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted({ a: Number.NaN }), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted({ a: Number.POSITIVE_INFINITY }), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted({ a: '5' as unknown as number }), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted({ a: 1e308, b: 1e308 }), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted([['a', 1, 2]] as unknown as Array<[string, number]>), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted(['a'] as unknown as Array<[string, number]>), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted(5 as unknown as Record<string, number>), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted(null as unknown as Record<string, number>), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted([1, 2], 'w' as unknown as () => number), 'BAD_ARGUMENT')
    expectCode(() => rng.weighted(5 as unknown as number[], () => 1), 'BAD_ARGUMENT')
    expect(() => rng.weighted({ sword: -1 })).toThrow('"sword" has weight -1')
  })
})

describe('luck.weights()', () => {
  it('describes itself', () => {
    const table = luck.weights({ gold: 70, gem: 25, crown: 5 })
    expect(table).toBeInstanceOf(WeightedTable)
    expect(table.size).toBe(3)
    expect(table.total).toBe(100)
    expect(table.items).toEqual(['gold', 'gem', 'crown'])
    expect(table.weights).toEqual([70, 25, 5])
    expect(table.odds()).toEqual([
      { item: 'gold', chance: 0.7 },
      { item: 'gem', chance: 0.25 },
      { item: 'crown', chance: 0.05 },
    ])
  })

  it('takes pairs and weight functions', () => {
    expect(luck.weights([[1, 1], [2, 3]]).odds()).toEqual([{ item: 1, chance: 0.25 }, { item: 2, chance: 0.75 }])
    expect(luck.weights(['a', 'bb'], (s) => s.length).total).toBe(3)
  })
})
