import { describe, expect, it } from 'vitest'
import { LootTable, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

describe('rng.loot()', () => {
  const SPEC = { common: 80, rare: 18, epic: 2 }

  it('opens like a chest', () => {
    const chest = luck('chest').loot(SPEC)
    expect(chest).toBeInstanceOf(LootTable)
    const drop: 'common' | 'rare' | 'epic' = chest.open()
    expect(['common', 'rare', 'epic']).toContain(drop)
    expect(chest.drops).toEqual(['common', 'rare', 'epic'])
  })

  it('shows the real odds', () => {
    expect(luck('chest').loot(SPEC).odds()).toEqual({ common: 0.8, rare: 0.18, epic: 0.02 })
  })

  it('drops at the stated rates', () => {
    const chest = luck('rates').loot(SPEC)
    const n = 100_000
    const counts = { common: 0, rare: 0, epic: 0 }
    for (const d of chest.openMany(n)) counts[d]++
    expect(Math.abs(counts.common / n - 0.8)).toBeLessThan(0.005)
    expect(Math.abs(counts.rare / n - 0.18)).toBeLessThan(0.005)
    expect(Math.abs(counts.epic / n - 0.02)).toBeLessThan(0.002)
  })

  it('opens many at once, and none', () => {
    const chest = luck('many').loot(SPEC)
    expect(chest.openMany(10)).toHaveLength(10)
    expect(chest.openMany(0)).toEqual([])
  })

  it('gives the same drops for the same seed', () => {
    expect(luck('same').loot(SPEC).openMany(50)).toEqual(luck('same').loot(SPEC).openMany(50))
  })

  it('explains bad tables', () => {
    const rng = luck('x')
    expectCode(() => rng.loot([] as unknown as Record<string, number>), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(null as unknown as Record<string, number>), 'BAD_ARGUMENT')
    expectCode(() => rng.loot({}), 'EMPTY_LIST')
    expectCode(() => rng.loot({ a: -5 }), 'BAD_ARGUMENT')
    expectCode(() => rng.loot(SPEC).openMany(-1), 'BAD_ARGUMENT')
  })
})
