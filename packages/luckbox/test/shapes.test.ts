import { describe, expect, it } from 'vitest'
import { type FairChanceState, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const stats = (xs: readonly number[]): { mean: number; variance: number } => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length
  return { mean, variance }
}
const many = (n: number, f: () => number): number[] => Array.from({ length: n }, f)

describe('normal()', () => {
  it('has the right mean, spread and shape', () => {
    const rng = luck('normal')
    const xs = many(400_000, () => rng.normal(100, 15))
    const { mean, variance } = stats(xs)
    expect(Math.abs(mean - 100)).toBeLessThan(0.1)
    expect(Math.abs(Math.sqrt(variance) - 15)).toBeLessThan(0.1)
    const within1 = xs.filter((x) => Math.abs(x - 100) < 15).length / xs.length
    const within2 = xs.filter((x) => Math.abs(x - 100) < 30).length / xs.length
    expect(Math.abs(within1 - 0.6827)).toBeLessThan(0.004)
    expect(Math.abs(within2 - 0.9545)).toBeLessThan(0.002)
  })

  it('defaults to mean 0, sd 1, and sd 0 gives the mean', () => {
    const rng = luck('n2')
    const { mean, variance } = stats(many(100_000, () => rng.normal()))
    expect(Math.abs(mean)).toBeLessThan(0.02)
    expect(Math.abs(variance - 1)).toBeLessThan(0.02)
    expect(rng.normal(5, 0)).toBe(5)
  })

  it('explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.normal(0, -1), 'BAD_ARGUMENT')
    expectCode(() => rng.normal(Number.NaN), 'BAD_ARGUMENT')
    expectCode(() => rng.normal(0, Number.POSITIVE_INFINITY), 'BAD_ARGUMENT')
  })
})

describe('exponential()', () => {
  it('has mean 1/rate and is never negative', () => {
    const rng = luck('exp')
    const xs = many(200_000, () => rng.exponential(0.5))
    expect(xs.every((x) => x >= 0)).toBe(true)
    expect(Math.abs(stats(xs).mean - 2)).toBeLessThan(0.03)
    expect(Math.abs(stats(many(100_000, () => rng.exponential())).mean - 1)).toBeLessThan(0.02)
  })

  it('explains bad rates', () => {
    expectCode(() => luck('x').exponential(0), 'BAD_ARGUMENT')
    expectCode(() => luck('x').exponential(-2), 'BAD_ARGUMENT')
  })
})

describe('poisson()', () => {
  it.each([0.5, 3, 9.9, 10, 25, 1000, 1e6])('mean %d: mean and variance both match', (lambda) => {
    const rng = luck(`poisson:${lambda}`)
    const xs = many(60_000, () => rng.poisson(lambda))
    expect(xs.every((x) => Number.isInteger(x) && x >= 0)).toBe(true)
    const { mean, variance } = stats(xs)
    const se = Math.sqrt(lambda / xs.length)
    expect(Math.abs(mean - lambda)).toBeLessThan(5 * se + 1e-9)
    expect(Math.abs(variance / lambda - 1)).toBeLessThan(0.05)
  })

  it('mean 0 is always 0 and draws nothing', () => {
    const rng = luck('zero')
    expect(rng.poisson(0)).toBe(0)
    expect(rng.draws).toBe(0)
  })

  it('explains bad means', () => {
    expectCode(() => luck('x').poisson(-1), 'BAD_ARGUMENT')
    expectCode(() => luck('x').poisson(2e9), 'BAD_ARGUMENT')
    expectCode(() => luck('x').poisson(Number.NaN), 'BAD_ARGUMENT')
  })
})

describe('triangular()', () => {
  it('stays in range with the right mean', () => {
    const rng = luck('tri')
    const xs = many(200_000, () => rng.triangular(1, 10, 3))
    expect(xs.every((x) => x >= 1 && x <= 10)).toBe(true)
    expect(Math.abs(stats(xs).mean - 14 / 3)).toBeLessThan(0.02)
  })

  it('defaults the mode to the middle, and handles min = max', () => {
    const rng = luck('tri2')
    expect(Math.abs(stats(many(100_000, () => rng.triangular(0, 10))).mean - 5)).toBeLessThan(0.03)
    expect(rng.triangular(4, 4)).toBe(4)
    expect(rng.triangular(0, 10, 0)).toBeGreaterThanOrEqual(0)
    expect(rng.triangular(0, 10, 10)).toBeLessThanOrEqual(10)
  })

  it('explains bad input', () => {
    expectCode(() => luck('x').triangular(0, 10, 11), 'BAD_ARGUMENT')
    expectCode(() => luck('x').triangular(10, 0), 'BAD_ARGUMENT')
    expectCode(() => luck('x').triangular(0, Number.NaN), 'BAD_ARGUMENT')
  })
})

describe('geometry', () => {
  it('angle() is from 0 up to 2π', () => {
    const rng = luck('angle')
    for (let i = 0; i < 10_000; i++) {
      const a = rng.angle()
      expect(a >= 0 && a < 2 * Math.PI).toBe(true)
    }
  })

  it('pointInCircle() spreads evenly over the area', () => {
    const rng = luck('disk')
    let inner = 0
    const n = 100_000
    for (let i = 0; i < n; i++) {
      const { x, y } = rng.pointInCircle(10)
      const d = Math.hypot(x, y)
      expect(d).toBeLessThan(10)
      if (d < 5) inner++
    }
    expect(Math.abs(inner / n - 0.25)).toBeLessThan(0.01) // half the radius = a quarter of the area
    expect(rng.pointInCircle(0)).toEqual({ x: 0, y: 0 })
  })

  it('pointOnCircle() lands on the edge in every direction', () => {
    const rng = luck('ring')
    const quadrants = [0, 0, 0, 0]
    for (let i = 0; i < 40_000; i++) {
      const { x, y } = rng.pointOnCircle(3)
      expect(Math.abs(Math.hypot(x, y) - 3)).toBeLessThan(1e-12)
      const q = (x >= 0 ? 0 : 1) + (y >= 0 ? 0 : 2)
      quadrants[q] = (quadrants[q] as number) + 1
    }
    for (const q of quadrants) expect(Math.abs(q / 40_000 - 0.25)).toBeLessThan(0.01)
  })

  it('pointInRect() stays inside', () => {
    const rng = luck('rect')
    for (let i = 0; i < 5_000; i++) {
      const p = rng.pointInRect(800, 600)
      expect(p.x >= 0 && p.x < 800 && p.y >= 0 && p.y < 600).toBe(true)
    }
  })

  it('geometry explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.pointInCircle(-1), 'BAD_ARGUMENT')
    expectCode(() => rng.pointOnCircle(Number.NaN), 'BAD_ARGUMENT')
    expectCode(() => rng.pointInRect(Number.POSITIVE_INFINITY, 5), 'BAD_ARGUMENT')
  })
})

describe('scatter()', () => {
  it('keeps every point at least `spacing` apart, inside the area', () => {
    const points = luck('forest').scatter(600, 400, 30)
    expect(points.length).toBeGreaterThan(100)
    for (const p of points) expect(p.x >= 0 && p.x < 600 && p.y >= 0 && p.y < 400).toBe(true)
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i] as { x: number; y: number }
        const b = points[j] as { x: number; y: number }
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(30)
      }
    }
  })

  it('fills the area (no big empty gaps)', () => {
    const points = luck('fill').scatter(400, 400, 20)
    // Bridson typically reaches about 65-70% of the densest hexagonal packing.
    const hexMax = (400 * 400) / ((Math.sqrt(3) / 2) * 20 * 20)
    expect(points.length / hexMax).toBeGreaterThan(0.55)
  })

  it('is the same for the same seed, and stops at maxPoints', () => {
    expect(luck('s').scatter(300, 300, 25)).toEqual(luck('s').scatter(300, 300, 25))
    expect(luck('s').scatter(300, 300, 10, { maxPoints: 7 })).toHaveLength(7)
    expect(luck('s').scatter(300, 300, 10, { maxPoints: 0 })).toEqual([])
    const few = luck('s').scatter(300, 300, 10, { tries: 1 }).length
    expect(few).toBeGreaterThanOrEqual(1)
    expect(few).toBeLessThan(luck('s').scatter(300, 300, 10).length)
  })

  it('explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.scatter(0, 10, 1), 'BAD_ARGUMENT')
    expectCode(() => rng.scatter(10, 10, -1), 'BAD_ARGUMENT')
    expectCode(() => rng.scatter(1e6, 1e6, 0.1), 'BAD_ARGUMENT')
    expectCode(() => rng.scatter(10, 10, 1, { tries: 0 }), 'BAD_ARGUMENT')
    expectCode(() => rng.scatter(10, 10, 1, { maxPoints: -1 }), 'BAD_ARGUMENT')
    expectCode(() => rng.scatter(10, 10, 1, 'x' as unknown as object), 'BAD_ARGUMENT')
  })
})

describe('fairChance()', () => {
  it.each([0.05, 0.1, 0.25, 0.5, 0.75, 0.9])('keeps an average of %d with no streak past worstCase', (p) => {
    const crit = luck(`fair:${p}`).fairChance(p)
    let hits = 0
    let misses = 0
    let longest = 0
    const n = 200_000
    for (let i = 0; i < n; i++) {
      if (crit.roll()) {
        hits++
        misses = 0
      } else longest = Math.max(longest, ++misses)
    }
    expect(Math.abs(hits / n - p)).toBeLessThan(0.006)
    expect(longest).toBeLessThan(crit.worstCase)
    expect(crit.chance).toBe(p)
  })

  it('beats plain chance on bad streaks', () => {
    const fair = luck('streak').fairChance(0.25)
    const plain = luck('streak')
    let fairWorst = 0
    let plainWorst = 0
    let f = 0
    let q = 0
    for (let i = 0; i < 100_000; i++) {
      fairWorst = Math.max(fairWorst, (f = fair.roll() ? 0 : f + 1))
      plainWorst = Math.max(plainWorst, (q = plain.chance(0.25) ? 0 : q + 1))
    }
    expect(fairWorst).toBeLessThan(13)
    expect(plainWorst).toBeGreaterThan(25)
  })

  it('raises the chance after each miss and resets after a hit', () => {
    const crit = luck('steps').fairChance(0.25)
    const first = crit.chanceNow
    while (crit.roll()) {
      /* wait for a miss */
    }
    expect(crit.misses).toBe(1)
    expect(crit.chanceNow).toBeCloseTo(first * 2, 12)
  })

  it('0 never hits and 1 always hits', () => {
    const never = luck('x').fairChance(0)
    const always = luck('x').fairChance(1)
    for (let i = 0; i < 1000; i++) {
      expect(never.roll()).toBe(false)
      expect(always.roll()).toBe(true)
    }
    expect(never.worstCase).toBe(Number.POSITIVE_INFINITY)
    expect(always.worstCase).toBe(1)
  })

  it('saves and continues exactly', () => {
    const rng = luck('fair-save')
    const crit = rng.fairChance(0.2)
    for (let i = 0; i < 7; i++) crit.roll()
    const saved = { rng: rng.state(), crit: crit.state() }
    const expected = Array.from({ length: 50 }, () => crit.roll())
    const crit2 = luck.from(saved.rng).fairChance(0.2, { state: saved.crit })
    expect(Array.from({ length: 50 }, () => crit2.roll())).toEqual(expected)
  })

  it('explains bad input and saves', () => {
    const rng = luck('x')
    expectCode(() => rng.fairChance(1.5), 'BAD_ARGUMENT')
    expectCode(() => rng.fairChance(0.5, 'x' as unknown as object), 'BAD_ARGUMENT')
    expectCode(() => rng.fairChance(0.5, { state: { misses: -1 } }), 'BAD_STATE')
    expectCode(() => rng.fairChance(0.5, { state: { misses: 99 } }), 'BAD_STATE')
    expectCode(() => rng.fairChance(0.5, { state: null as unknown as FairChanceState }), 'BAD_STATE')
  })
})

describe('hash()', () => {
  it('matches for the same position and changes after a draw', () => {
    const a = luck('h')
    const b = luck('h')
    expect(a.hash()).toBe(b.hash())
    expect(a.hash()).toMatch(/^[0-9a-f]{8}$/)
    a.uint32()
    expect(a.hash()).not.toBe(b.hash())
    b.uint32()
    expect(a.hash()).toBe(b.hash())
  })

  it('survives save/load and differs between algorithms and seeds', () => {
    const rng = luck('h2')
    rng.float()
    expect(luck.from(rng.state()).hash()).toBe(rng.hash())
    expect(luck('h2', { algorithm: 'mulberry32' }).hash()).not.toBe(luck('h2').hash())
    expect(luck('h3').hash()).not.toBe(luck('h2').hash())
  })
})

describe('luck.patchMathRandom()', () => {
  it('makes Math.random repeatable until restored', () => {
    const original = Math.random
    const a = luck.patchMathRandom('t')
    const first = [Math.random(), Math.random(), Math.random()]
    a.restore()
    expect(Math.random).toBe(original)
    const b = luck.patchMathRandom('t')
    expect([Math.random(), Math.random(), Math.random()]).toEqual(first)
    b.restore()
    b.restore() // a second restore does nothing
    expect(Math.random).toBe(original)
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true)
  })
})
