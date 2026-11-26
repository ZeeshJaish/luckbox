// Statistical fairness battery. Every test uses a fixed seed, so results never
// flake; limits sit around 5 standard deviations (p < 1e-6) from perfect, so a
// fair generator passes comfortably and a broken one fails clearly.
import { describe, expect, it } from 'vitest'
import { ALGORITHMS, type Algorithm, luck } from '../src/index.ts'
import { chiSquare } from './helpers.ts'

const N = 1 << 20

/** Bounds for a chi-square with `df` degrees of freedom at about ±5 standard deviations. */
const chiBounds = (df: number): [number, number] => [df - 5 * Math.sqrt(2 * df), df + 6 * Math.sqrt(2 * df)]

describe.each(ALGORITHMS)('%s passes the fairness battery', (algorithm: Algorithm) => {
  const words = (() => {
    const rng = luck(`battery:${algorithm}`, { algorithm })
    const out = new Uint32Array(N)
    for (let i = 0; i < N; i++) out[i] = rng.uint32()
    return out
  })()

  it('monobit: ones and zeros are balanced', () => {
    let ones = 0
    for (const w of words) {
      let x = w
      while (x) {
        ones += x & 1
        x >>>= 1
      }
    }
    const bits = N * 32
    const z = (ones - bits / 2) / (Math.sqrt(bits) / 2)
    expect(Math.abs(z)).toBeLessThan(5)
  })

  it('every byte value is equally common (chi-square, 4 million bytes)', () => {
    const counts = new Array<number>(256).fill(0)
    for (const w of words) {
      counts[w & 255] = (counts[w & 255] as number) + 1
      counts[(w >>> 8) & 255] = (counts[(w >>> 8) & 255] as number) + 1
      counts[(w >>> 16) & 255] = (counts[(w >>> 16) & 255] as number) + 1
      counts[w >>> 24] = (counts[w >>> 24] as number) + 1
    }
    const [lo, hi] = chiBounds(255)
    const x2 = chiSquare(counts)
    expect(x2).toBeGreaterThan(lo)
    expect(x2).toBeLessThan(hi)
  })

  it.each([
    ['top', 27],
    ['bottom', 0],
  ])('back-to-back pairs fill a 32 × 32 grid evenly (%s 5 bits)', (_where, shift) => {
    const grid = new Array<number>(1024).fill(0)
    for (let i = 0; i < N; i += 2) {
      const cell = (((words[i] as number) >>> shift) & 31) * 32 + (((words[i + 1] as number) >>> shift) & 31)
      grid[cell] = (grid[cell] as number) + 1
    }
    const [lo, hi] = chiBounds(1023)
    const x2 = chiSquare(grid)
    expect(x2).toBeGreaterThan(lo)
    expect(x2).toBeLessThan(hi)
  })

  it('no correlation between one number and the next', () => {
    let sx = 0
    let sxx = 0
    let sxy = 0
    for (let i = 0; i < N - 1; i++) {
      const x = (words[i] as number) / 0x100000000
      const y = (words[i + 1] as number) / 0x100000000
      sx += x
      sxx += x * x
      sxy += x * y
    }
    const n = N - 1
    const mean = sx / n
    const r = (sxy / n - mean * mean) / (sxx / n - mean * mean)
    expect(Math.abs(r)).toBeLessThan(5 / Math.sqrt(n))
  })

  it.each([
    ['highest', 31],
    ['lowest', 0],
  ])('runs of the %s bit have the expected count', (_which, bit) => {
    let runs = 1
    let above = 0
    let prev = (((words[0] as number) >>> bit) & 1) === 1
    for (let i = 0; i < N; i++) {
      const hi = (((words[i] as number) >>> bit) & 1) === 1
      if (hi) above++
      if (i > 0 && hi !== prev) runs++
      prev = hi
    }
    const below = N - above
    const mean = (2 * above * below) / N + 1
    const variance = ((mean - 1) * (mean - 2)) / (N - 1)
    expect(Math.abs((runs - mean) / Math.sqrt(variance))).toBeLessThan(5)
  })

  it.each([
    ['top', 8, 0xffffff],
    ['bottom', 0, 0xffffff],
  ])("birthday spacings (Marsaglia's test) match a Poisson distribution (%s 24 bits)", (_where, shift, mask) => {
    // 1,024 birthdays in a year of 2^24 days: repeated spacings ~ Poisson(16) per trial.
    const rng = luck(`birthday:${algorithm}`, { algorithm })
    const trials = 400
    let total = 0
    for (let t = 0; t < trials; t++) {
      const days = Array.from({ length: 1024 }, () => (rng.uint32() >>> shift) & mask).sort((a, b) => a - b)
      const spacings = days.map((d, i) => (i === 0 ? d : d - (days[i - 1] as number))).sort((a, b) => a - b)
      for (let i = 1; i < spacings.length; i++) if (spacings[i] === spacings[i - 1]) total++
    }
    const expected = 16 * trials
    expect(Math.abs((total - expected) / Math.sqrt(expected))).toBeLessThan(5)
  })
})

describe('streams that should be unrelated are unrelated', () => {
  const correlation = (a: () => number, b: () => number, n = 200_000): number => {
    let sa = 0
    let sb = 0
    let saa = 0
    let sbb = 0
    let sab = 0
    for (let i = 0; i < n; i++) {
      const x = a()
      const y = b()
      sa += x
      sb += y
      saa += x * x
      sbb += y * y
      sab += x * y
    }
    const cov = sab / n - (sa / n) * (sb / n)
    return cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2))
  }

  it('forks of the same seed', () => {
    const world = luck('world')
    const a = world.fork('a')
    const b = world.fork('b')
    expect(Math.abs(correlation(() => a.float(), () => b.float()))).toBeLessThan(5 / Math.sqrt(200_000))
  })

  it('back-to-back seeds (level-1 and level-2)', () => {
    const a = luck('level-1')
    const b = luck('level-2')
    expect(Math.abs(correlation(() => a.float(), () => b.float()))).toBeLessThan(5 / Math.sqrt(200_000))
  })

  it('daily seeds of neighbouring days', () => {
    const a = luck.daily({ date: '2026-11-26' })
    const b = luck.daily({ date: '2026-11-27' })
    expect(Math.abs(correlation(() => a.float(), () => b.float()))).toBeLessThan(5 / Math.sqrt(200_000))
  })
})

describe('a million rolls agree with the exact odds', () => {
  it.each(['4d6kh3', '2d20kh1', '3d6!', '2d6r1+1d4', '4dF*3'])('%s', (notation) => {
    const rng = luck(`million:${notation}`)
    const counts = new Map<number, number>()
    const n = 1_000_000
    for (let i = 0; i < n; i++) {
      const t = rng.roll(notation)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    const odds = luck.odds(notation)
    let x2 = 0
    let df = -1
    for (const { total, chance } of odds.totals) {
      const expected = chance * n
      if (expected < 5) continue
      x2 += ((counts.get(total) ?? 0) - expected) ** 2 / expected
      df++
    }
    for (const total of counts.keys()) expect(odds.chance(total)).toBeGreaterThan(0)
    expect(x2).toBeLessThan(chiBounds(df)[1])
  })

  it('pity rates() agree with a million opens', () => {
    const banner = luck('million-pity').loot(
      { star5: 6, star4: 51, star3: 943 },
      { pity: { star5: 90, star4: 10 }, softPity: { star5: { after: 73, add: 0.06 } } },
    )
    const exact = banner.rates()
    const sim = banner.simulate(1_000_000)
    for (const [k, r] of Object.entries(exact)) {
      const sd = Math.sqrt((r * (1 - r)) / 1_000_000)
      expect(Math.abs((sim.drops[k]?.rate ?? 0) - r)).toBeLessThan(5 * sd)
    }
  })
})
