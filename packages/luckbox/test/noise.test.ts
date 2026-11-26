import { describe, expect, it } from 'vitest'
import { luck } from '../src/index.ts'
import { createNoise } from '../src/noise.ts'
import { expectCode } from './helpers.ts'

describe('createNoise()', () => {
  it('stays between −1 and 1 and uses most of that range', () => {
    const noise = createNoise('range')
    let min2 = 0
    let max2 = 0
    let min3 = 0
    let max3 = 0
    for (let i = 0; i < 200_000; i++) {
      const x = (i % 997) * 0.173
      const y = Math.floor(i / 997) * 0.211
      const a = noise.noise2d(x, y)
      const b = noise.noise3d(x, y, i * 0.0137)
      min2 = Math.min(min2, a)
      max2 = Math.max(max2, a)
      min3 = Math.min(min3, b)
      max3 = Math.max(max3, b)
    }
    for (const v of [min2, max2, min3, max3]) expect(Math.abs(v)).toBeLessThanOrEqual(1)
    expect(max2 - min2).toBeGreaterThan(1.4)
    expect(max3 - min3).toBeGreaterThan(1.4)
  })

  it('is smooth: nearby points give nearby values', () => {
    const noise = createNoise('smooth')
    for (let i = 0; i < 5_000; i++) {
      const x = i * 0.37
      const y = i * 0.19
      expect(Math.abs(noise.noise2d(x, y) - noise.noise2d(x + 0.001, y))).toBeLessThan(0.02)
      expect(Math.abs(noise.noise3d(x, y, 1) - noise.noise3d(x, y, 1.001))).toBeLessThan(0.02)
    }
  })

  it('is the same for the same seed, different for another, and matches createNoise(luck(seed))', () => {
    const a = createNoise('world')
    const b = createNoise('world')
    const c = createNoise('other')
    const d = createNoise(luck('world'))
    for (let i = 0; i < 1_000; i++) {
      const x = i * 0.7
      const y = i * 1.3
      expect(a.noise2d(x, y)).toBe(b.noise2d(x, y))
      expect(a.noise3d(x, y, 2)).toBe(d.noise3d(x, y, 2))
    }
    let same = 0
    for (let i = 0; i < 1_000; i++) if (a.noise2d(i * 0.7, i * 1.3) === c.noise2d(i * 0.7, i * 1.3)) same++
    expect(same).toBeLessThan(50)
  })

  it('never moves the Rng it was made from', () => {
    const rng = luck('keep')
    createNoise(rng)
    expect(rng.draws).toBe(0)
  })

  it('handles negative and huge coordinates', () => {
    const noise = createNoise('far')
    for (const [x, y] of [[-12.5, -3.25], [1e7, -1e7], [-0.0001, 0]]) {
      const v = noise.noise2d(x as number, y as number)
      expect(Number.isFinite(v) && Math.abs(v) <= 1).toBe(true)
    }
  })

  it('fbm adds detail and stays between −1 and 1', () => {
    const noise = createNoise('fbm')
    for (let i = 0; i < 20_000; i++) {
      const v = noise.fbm2d(i * 0.013, i * 0.007, { octaves: 6 })
      const w = noise.fbm3d(i * 0.013, i * 0.007, 0.5, { octaves: 3, gain: 0.6, lacunarity: 2.2, frequency: 0.5 })
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      expect(Math.abs(w)).toBeLessThanOrEqual(1)
    }
    expect(noise.fbm2d(1.5, 2.5, { octaves: 1 })).toBe(noise.noise2d(1.5, 2.5))
  })

  it('explains bad input', () => {
    const noise = createNoise('x')
    expectCode(() => createNoise(), 'BAD_SEED')
    expectCode(() => noise.noise2d(Number.NaN, 0), 'BAD_ARGUMENT')
    expectCode(() => noise.noise3d(0, 0, Number.POSITIVE_INFINITY), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm2d(0, 0, { octaves: 0 }), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm2d(0, 0, { octaves: 17 }), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm3d(0, 0, 0, { gain: 0 }), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm2d(0, 0, 'x' as never), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm2d(Number.NaN, 0), 'BAD_ARGUMENT')
    expectCode(() => noise.fbm3d(0, Number.NaN, 0), 'BAD_ARGUMENT')
  })
})
