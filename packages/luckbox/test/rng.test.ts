import { describe, expect, it } from 'vitest'
import { ALGORITHMS, type Algorithm, luck } from '../src/index.ts'
import { CHI_001, chiSquare, expectCode } from './helpers.ts'

describe('int(min, max)', () => {
  it('stays in range, includes both ends, and hits every value', () => {
    const rng = luck('int')
    const seen = new Set<number>()
    for (let i = 0; i < 2_000; i++) {
      const n = rng.int(1, 6)
      expect(n >= 1 && n <= 6 && Number.isInteger(n)).toBe(true)
      seen.add(n)
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('is fair: a d6 passes the chi-square test', () => {
    const rng = luck('fair-d6')
    const counts = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < 60_000; i++) {
      const face = rng.int(1, 6) - 1
      counts[face] = (counts[face] as number) + 1
    }
    expect(chiSquare(counts)).toBeLessThan(CHI_001[5] as number)
  })

  it('has no modulo bias, even for huge ranges', () => {
    // With the naive `x % n` trick, values below 2^30 would come up half the
    // time for this range. Without bias they come up a third of the time.
    const n = 3 * 2 ** 30
    const rng = luck('no-bias')
    let low = 0
    const draws = 30_000
    for (let i = 0; i < draws; i++) if (rng.int(0, n - 1) < 2 ** 30) low++
    expect(low / draws).toBeGreaterThan(0.32)
    expect(low / draws).toBeLessThan(0.35)
  })

  it('works for ranges bigger than 2^32 and up to 2^53', () => {
    const rng = luck('big')
    for (let i = 0; i < 2_000; i++) {
      const a = rng.int(0, 2 ** 40)
      expect(a >= 0 && a <= 2 ** 40 && Number.isInteger(a)).toBe(true)
      const b = rng.int(-(2 ** 52), 2 ** 52 - 1)
      expect(b >= -(2 ** 52) && b < 2 ** 52 && Number.isInteger(b)).toBe(true)
    }
    const top = Number.MAX_SAFE_INTEGER
    expect(rng.int(0, top)).toBeLessThanOrEqual(top)
    // The 53-bit path is fair too: above 2^52 about half the time.
    let high = 0
    for (let i = 0; i < 4_000; i++) if (rng.int(0, top) >= 2 ** 52) high++
    expect(high / 4_000).toBeGreaterThan(0.46)
    expect(high / 4_000).toBeLessThan(0.54)
  })

  it('handles negative ranges and single values', () => {
    const rng = luck('neg')
    for (let i = 0; i < 500; i++) {
      const n = rng.int(-10, -5)
      expect(n >= -10 && n <= -5).toBe(true)
    }
    const before = rng.draws
    expect(rng.int(7, 7)).toBe(7)
    expect(rng.draws).toBe(before) // nothing to choose, so nothing drawn
  })

  it('explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.int(1.5, 6), 'BAD_ARGUMENT')
    expectCode(() => rng.int(1, Number.NaN), 'BAD_ARGUMENT')
    expectCode(() => rng.int(6, 1), 'BAD_ARGUMENT')
    expectCode(() => rng.int(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), 'BAD_ARGUMENT')
    expectCode(() => rng.int('1' as unknown as number, 6), 'BAD_ARGUMENT')
  })
})

describe('float()', () => {
  it('is from 0 up to (not including) 1, with an average near 0.5', () => {
    const rng = luck('float')
    let sum = 0
    for (let i = 0; i < 50_000; i++) {
      const f = rng.float()
      expect(f >= 0 && f < 1).toBe(true)
      sum += f
    }
    expect(Math.abs(sum / 50_000 - 0.5)).toBeLessThan(0.01)
  })

  it('uses all 53 bits of precision, not just 32', () => {
    const rng = luck('precision')
    const fine = Array.from({ length: 100 }, () => rng.float()).filter((f) => !Number.isInteger(f * 2 ** 32))
    expect(fine.length).toBeGreaterThan(90)
  })

  it('fills 16 equal buckets evenly', () => {
    const rng = luck('buckets')
    const counts = new Array<number>(16).fill(0)
    for (let i = 0; i < 64_000; i++) {
      const bucket = Math.floor(rng.float() * 16)
      counts[bucket] = (counts[bucket] as number) + 1
    }
    expect(chiSquare(counts)).toBeLessThan(CHI_001[15] as number)
  })
})

describe('range(min, max)', () => {
  it('stays in [min, max)', () => {
    const rng = luck('range')
    for (let i = 0; i < 5_000; i++) {
      const r = rng.range(-2.5, 7.25)
      expect(r >= -2.5 && r < 7.25).toBe(true)
    }
  })

  it('returns min when min equals max', () => {
    expect(luck('r').range(3, 3)).toBe(3)
  })

  it('never returns max, even when rounding would land on it', () => {
    const rng = luck('edge')
    for (let i = 0; i < 5_000; i++) expect(rng.range(1, 1 + Number.EPSILON)).toBe(1)
  })

  it('explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.range(0, Number.POSITIVE_INFINITY), 'BAD_ARGUMENT')
    expectCode(() => rng.range(Number.NaN, 1), 'BAD_ARGUMENT')
    expectCode(() => rng.range(5, 1), 'BAD_ARGUMENT')
    expectCode(() => rng.range(-1e308, 1e308), 'BAD_ARGUMENT')
  })
})

describe('chance(p), bool(), sign()', () => {
  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = luck('chance')
    for (let i = 0; i < 2_000; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('chance(0.25) is true about a quarter of the time', () => {
    const rng = luck('quarter')
    let hits = 0
    for (let i = 0; i < 40_000; i++) if (rng.chance(0.25)) hits++
    expect(Math.abs(hits / 40_000 - 0.25)).toBeLessThan(0.01)
  })

  it('chance explains bad probabilities', () => {
    const rng = luck('x')
    for (const bad of [-0.1, 1.1, Number.NaN, 25, '0.5']) expectCode(() => rng.chance(bad as number), 'BAD_ARGUMENT')
  })

  it('bool and sign are 50/50', () => {
    const rng = luck('coin')
    let heads = 0
    let plus = 0
    for (let i = 0; i < 40_000; i++) {
      if (rng.bool()) heads++
      const s = rng.sign()
      expect(s === 1 || s === -1).toBe(true)
      if (s === 1) plus++
    }
    expect(Math.abs(heads / 40_000 - 0.5)).toBeLessThan(0.01)
    expect(Math.abs(plus / 40_000 - 0.5)).toBeLessThan(0.01)
  })
})

describe('pick, sample, shuffle', () => {
  it('pick returns items from the list, each one reachable', () => {
    const rng = luck('pick')
    const items = ['sword', 'bow', 'staff'] as const
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(rng.pick(items))
    expect([...seen].sort()).toEqual(['bow', 'staff', 'sword'])
    expect('abc').toContain(rng.pick('abc'))
  })

  it('pick explains empty and non-lists', () => {
    const rng = luck('x')
    expectCode(() => rng.pick([]), 'EMPTY_LIST')
    expectCode(() => rng.pick(null as unknown as string[]), 'BAD_ARGUMENT')
    expectCode(() => rng.pick(5 as unknown as string[]), 'BAD_ARGUMENT')
    expectCode(() => rng.pick({} as unknown as string[]), 'BAD_ARGUMENT')
  })

  it('sample gives different items, without changing the list', () => {
    const rng = luck('sample')
    const list = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let i = 0; i < 200; i++) {
      const s = rng.sample(list, 4)
      expect(s).toHaveLength(4)
      expect(new Set(s).size).toBe(4)
      for (const x of s) expect(list).toContain(x)
    }
    expect(rng.sample(list, 0)).toEqual([])
    expect([...rng.sample(list, 10)].sort((a, b) => a - b)).toEqual([...list])
  })

  it('sample explains bad counts', () => {
    const rng = luck('x')
    expectCode(() => rng.sample([1, 2], 3), 'BAD_ARGUMENT')
    expectCode(() => rng.sample([1, 2], -1), 'BAD_ARGUMENT')
    expectCode(() => rng.sample([1, 2], 1.5), 'BAD_ARGUMENT')
    expectCode(() => rng.sample(undefined as unknown as number[], 1), 'BAD_ARGUMENT')
  })

  it('shuffle returns a new array with the same items and leaves the original alone', () => {
    const rng = luck('shuffle')
    const deck = Object.freeze(Array.from({ length: 52 }, (_, i) => i))
    const shuffled = rng.shuffle(deck)
    expect(shuffled).not.toBe(deck)
    expect(shuffled).not.toEqual([...deck])
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...deck])
  })

  it('shuffle is fair: all 6 orders of 3 cards are equally likely', () => {
    const rng = luck('fair-shuffle')
    const counts = new Map<string, number>()
    for (let i = 0; i < 60_000; i++) {
      const k = rng.shuffle([0, 1, 2]).join('')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    expect(chiSquare([...counts.values()])).toBeLessThan(CHI_001[5] as number)
  })

  it('shuffleInPlace changes and returns the same array', () => {
    const rng = luck('in-place')
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(rng.shuffleInPlace(arr)).toBe(arr)
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rng.shuffleInPlace([])).toEqual([])
    expectCode(() => rng.shuffleInPlace('abc' as unknown as string[]), 'BAD_ARGUMENT')
    expectCode(() => rng.shuffle(7 as unknown as number[]), 'BAD_ARGUMENT')
  })
})

describe('id() and uuid()', () => {
  it('id makes readable 12-letter codes by default', () => {
    const rng = luck('id')
    for (let i = 0; i < 200; i++) expect(rng.id()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{12}$/)
  })

  it('id takes a length and any alphabet, emoji included', () => {
    const rng = luck('id2')
    expect(rng.id(6, 'AB')).toMatch(/^[AB]{6}$/)
    expect(rng.id(0)).toBe('')
    const dice = rng.id(5, '⚀⚁⚂⚃⚄⚅')
    expect(Array.from(dice)).toHaveLength(5)
    const emoji = rng.id(4, '🍎🍌🍇')
    expect(Array.from(emoji).every((c) => '🍎🍌🍇'.includes(c))).toBe(true)
  })

  it('id explains bad input', () => {
    const rng = luck('x')
    expectCode(() => rng.id(-1), 'BAD_ARGUMENT')
    expectCode(() => rng.id(2.5), 'BAD_ARGUMENT')
    expectCode(() => rng.id(4, 'a'), 'BAD_ARGUMENT')
    expectCode(() => rng.id(4, 'aab'), 'BAD_ARGUMENT')
    expectCode(() => rng.id(4, 7 as unknown as string), 'BAD_ARGUMENT')
  })

  it('uuid makes valid version 4 UUIDs that do not repeat', () => {
    const rng = luck('uuid')
    const all = new Set<string>()
    for (let i = 0; i < 1_000; i++) {
      const u = rng.uuid()
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      all.add(u)
    }
    expect(all.size).toBe(1_000)
  })
})

describe('draws', () => {
  it('counts every 32-bit number drawn', () => {
    const rng = luck('count')
    expect(rng.draws).toBe(0)
    rng.uint32()
    expect(rng.draws).toBe(1)
    rng.float()
    expect(rng.draws).toBe(3)
    rng.uuid()
    expect(rng.draws).toBe(7)
  })
})

describe.each(ALGORITHMS)('algorithm %s', (algorithm: Algorithm) => {
  it('powers every method', () => {
    const rng = luck('algo', { algorithm })
    expect(rng.algorithm).toBe(algorithm)
    expect(rng.int(1, 6)).toBeGreaterThanOrEqual(1)
    expect(rng.float()).toBeLessThan(1)
    expect(rng.shuffle([1, 2, 3])).toHaveLength(3)
    expect(rng.uuid()).toHaveLength(36)
  })
})

describe('options', () => {
  it('defaults to sfc32', () => {
    expect(luck('x').algorithm).toBe('sfc32')
    expect(luck('x', {}).algorithm).toBe('sfc32')
  })

  it('different algorithms give different numbers for the same seed', () => {
    const outs = ALGORITHMS.map((algorithm) => luck('same', { algorithm }).uint32())
    expect(new Set(outs).size).toBe(ALGORITHMS.length)
  })

  it('explains bad options', () => {
    expectCode(() => luck('x', { algorithm: 'mt19937' as Algorithm }), 'BAD_ALGORITHM')
    expectCode(() => luck('x', 'sfc32' as unknown as { algorithm: Algorithm }), 'BAD_ARGUMENT')
    expectCode(() => luck('x', null as unknown as { algorithm: Algorithm }), 'BAD_ARGUMENT')
  })
})

describe('no patterns between back-to-back results', () => {
  it.each(ALGORITHMS)('%s: bool() flips half the time (no true/false/true/false rhythm)', (algorithm) => {
    const rng = luck('rhythm', { algorithm })
    let prev = rng.bool()
    let flips = 0
    const n = 100_000
    for (let i = 0; i < n; i++) {
      const b = rng.bool()
      if (b !== prev) flips++
      prev = b
    }
    expect(Math.abs(flips / n - 0.5)).toBeLessThan(0.01)
  })
})

describe('error messages', () => {
  it('show the bad value so the fix is obvious', () => {
    const rng = luck('x')
    expect(() => rng.int(1n as unknown as number, 6)).toThrow('int(1n, 6)')
    expect(() => rng.int('1' as unknown as number, 6)).toThrow('int("1", 6)')
    expect(() => rng.pick(Symbol('s') as unknown as string[])).toThrow('Symbol(s)')
    expect(() => rng.chance([0.5] as unknown as number)).toThrow('[0.5]')
    expect(() => rng.pick({ a: 1 } as unknown as string[])).toThrow('an object')
  })
})
