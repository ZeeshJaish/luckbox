// Property tests: thousands of random inputs, each checked against a rule
// that must always hold. Inputs come from a fixed seed, so failures repeat.
import { describe, expect, it } from 'vitest'
import { ALGORITHMS, luck } from '../src/index.ts'

const gen = luck('properties')
const CASES = 3_000

/** A random whole number with a wide spread of sizes, including the extremes. */
const anyInt = (): number => {
  const kind = gen.int(0, 4)
  if (kind === 0) return gen.int(-10, 10)
  if (kind === 1) return gen.int(-1000, 1000)
  if (kind === 2) return gen.int(-(2 ** 31), 2 ** 31)
  if (kind === 3) return gen.int(-(2 ** 52), 2 ** 52)
  return gen.pick([0, 1, -1, 2 ** 32, 2 ** 32 - 1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])
}

describe('properties', () => {
  it('int(min, max) is always a whole number in range', () => {
    for (let c = 0; c < CASES; c++) {
      let a = anyInt()
      let b = anyInt()
      if (a > b) [a, b] = [b, a]
      if (b - a + 1 > 2 ** 53) continue
      const rng = luck(`int:${c}`, { algorithm: gen.pick(ALGORITHMS) })
      for (let k = 0; k < 5; k++) {
        const v = rng.int(a, b)
        expect(Number.isSafeInteger(v) && v >= a && v <= b).toBe(true)
      }
    }
  })

  it('range(min, max) is always in [min, max)', () => {
    for (let c = 0; c < CASES; c++) {
      const a = gen.range(-1e6, 1e6)
      const b = a + gen.pick([0, 1e-9, 1e-3, 1, 1e3, 1e9])
      const v = luck(`range:${c}`).range(a, b)
      expect(v >= a && (v < b || (a === b && v === a))).toBe(true)
    }
  })

  it('shuffle returns a permutation, and sample returns distinct items', () => {
    for (let c = 0; c < CASES; c++) {
      const n = gen.int(0, 40)
      const list = Array.from({ length: n }, (_, i) => i * 3 + gen.int(0, 2))
      const rng = luck(`shuffle:${c}`)
      expect([...rng.shuffle(list)].sort((x, y) => x - y)).toEqual([...list].sort((x, y) => x - y))
      const k = gen.int(0, n)
      const s = rng.sample(list.map((_, i) => i), k)
      expect(s).toHaveLength(k)
      expect(new Set(s).size).toBe(k)
      if (n > 0) expect(list).toContain(rng.pick(list))
    }
  })

  it('every random dice notation rolls within its exact odds', { timeout: 120_000 }, () => {
    let tooBig = 0
    for (let c = 0; c < 1_500; c++) {
      const count = gen.int(1, 5)
      const sides = gen.pick([2, 3, 4, 6, 8, 10, 12, 20])
      let notation = `${count}d${sides}`
      if (count > 1 && gen.chance(0.4)) notation += `${gen.pick(['kh', 'kl', 'dh', 'dl'])}${gen.int(1, count - 1)}`
      if (gen.chance(0.06)) notation += '!' // exploding odds are the slowest to work out, so fewer of them
      if (gen.chance(0.2)) notation += `r${gen.chance(0.5) ? 'o' : ''}1`
      if (gen.chance(0.2)) notation += `*${gen.int(2, 5)}`
      if (gen.chance(0.5)) notation += `${gen.pick(['+', '-'])}${gen.int(0, 9)}`
      if (gen.chance(0.2)) notation += `+1d${gen.pick([4, 6])}`
      const rng = luck(`dice:${c}`)
      let odds: ReturnType<typeof luck.odds>
      try {
        odds = luck.odds(notation)
      } catch (e) {
        // Exploding dice with keep/drop on big dice can be too big to work out exactly.
        // That is reported clearly and fast, and rolling still works.
        expect(String(e)).toContain('too many possible totals')
        tooBig++
        for (let k = 0; k < 10; k++) expect(Number.isInteger(rng.roll(notation))).toBe(true)
        continue
      }
      for (let k = 0; k < 10; k++) {
        const total = rng.roll(notation)
        expect(odds.chance(total), `${notation} rolled ${total}`).toBeGreaterThan(0)
      }
      const sum = odds.totals.reduce((s, t) => s + t.chance, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
    }
    expect(tooBig).toBeLessThan(150) // only rare, extreme combinations
  })

  it('weighted picks never pick weight 0, and odds always add up to 1', () => {
    for (let c = 0; c < CASES; c++) {
      const n = gen.int(1, 12)
      const weights: Record<string, number> = {}
      for (let i = 0; i < n; i++) weights[`k${i}`] = gen.chance(0.3) ? 0 : gen.chance(0.5) ? gen.int(1, 100) : gen.range(0.01, 10)
      if (Object.values(weights).every((w) => w === 0)) weights.k0 = 1
      const rng = luck(`weighted:${c}`)
      for (let k = 0; k < 10; k++) expect(weights[rng.weighted(weights)]).toBeGreaterThan(0)
      const total = luck.weights(weights).odds().reduce((s, o) => s + o.chance, 0)
      expect(Math.abs(total - 1)).toBeLessThan(1e-12)
    }
  })

  it('save and load at any point continues exactly, for every algorithm', () => {
    for (let c = 0; c < 500; c++) {
      const rng = luck(`state:${c}`, { algorithm: gen.pick(ALGORITHMS) })
      const steps = gen.int(0, 200)
      for (let k = 0; k < steps; k++) rng.uint32()
      const copy = luck.from(JSON.stringify(rng))
      for (let k = 0; k < 20; k++) expect(copy.uint32()).toBe(rng.uint32())
      expect(copy.hash()).toBe(rng.hash())
    }
  })

  it('a fork never depends on how many numbers the parent drew', () => {
    for (let c = 0; c < 500; c++) {
      const seed = `fork:${c}`
      const name = gen.id(gen.int(0, 10))
      const want = luck(seed).fork(name).uint32()
      const busy = luck(seed)
      const steps = gen.int(1, 300)
      for (let k = 0; k < steps; k++) busy.uint32()
      expect(busy.fork(name).uint32()).toBe(want)
    }
  })

  it('id() always uses only its alphabet, at the right length', () => {
    for (let c = 0; c < CASES; c++) {
      const alphabet = [...new Set(gen.id(gen.int(2, 20), 'abcdefghijklmnopqrstuvwxyz0123456789🎲⚀'))].join('')
      if (Array.from(alphabet).length < 2) continue
      const length = gen.int(0, 30)
      const id = luck(`id:${c}`).id(length, alphabet)
      const chars = Array.from(id)
      expect(chars).toHaveLength(length)
      for (const ch of chars) expect(alphabet).toContain(ch)
    }
  })

  it('pity never lets a drop wait past its limit, for any table', () => {
    for (let c = 0; c < 200; c++) {
      const limit = gen.int(2, 30)
      const chest = luck(`pity:${c}`).loot({ rare: gen.int(0, 5), other: gen.int(1, 100) }, { pity: { rare: limit } })
      let wait = 0
      for (let k = 0; k < 300; k++) {
        if (chest.open() === 'rare') wait = 0
        else expect(++wait).toBeLessThan(limit)
      }
    }
  })
})
