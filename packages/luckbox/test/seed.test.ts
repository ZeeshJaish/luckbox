import { describe, expect, it } from 'vitest'
import { luck } from '../src/index.ts'
import { READABLE_ALPHABET, type Seed, seedBytes, seedKey } from '../src/seed.ts'
import { CHI_001, bitDiff, chiSquare, expectCode } from './helpers.ts'

const first = (seed: Seed, n = 5): number[] => {
  const rng = luck(seed)
  return Array.from({ length: n }, () => rng.uint32())
}

describe('seeds', () => {
  it('give the same numbers every time', () => {
    expect(first('hello')).toEqual(first('hello'))
  })

  it('treat numbers and bigints like their text, so URL seeds match code seeds', () => {
    expect(first(42)).toEqual(first('42'))
    expect(first(42n)).toEqual(first('42'))
    expect(first(-0)).toEqual(first('0'))
    expect(first(0.5)).toEqual(first('0.5'))
  })

  it('keep lists apart from text and from other lists', () => {
    const all = [first('a'), first(['a']), first(['a', 'b']), first(['ab']), first([['a', 'b']]), first(['a', ['b']])]
    const unique = new Set(all.map((x) => x.join(',')))
    expect(unique.size).toBe(all.length)
  })

  it('accept lists of mixed seeds, like world chunks', () => {
    expect(first(['world', 3, -7])).toEqual(first(['world', '3', '-7']))
    expect(first(['world', 3, -7])).not.toEqual(first(['world', -7, 3]))
  })

  it('accept empty text and unicode', () => {
    expect(first('')).toEqual(first(''))
    expect(first('🎲 मुंबई')).toEqual(first('🎲 मुंबई'))
    expect(first('🎲')).not.toEqual(first('🎯'))
  })

  it('encode text exactly like TextEncoder (UTF-8)', () => {
    const encoder = new TextEncoder()
    const samples = ['', 'abc', 'é', 'ß', '€', 'मुंबई', '日本語', '🎲', '👩‍👩‍👧', '\u0000', '߿ࠀ￿', '\ud800', 'a\udc00b', '\ud83c']
    for (const s of samples) expect(Array.from(seedBytes(s))).toEqual(Array.from(encoder.encode(s)))
  })

  it('reject things that are not seeds, with BAD_SEED', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, null, {}, true, Symbol('x'), () => 1]) {
      expectCode(() => luck(bad as unknown as Seed), 'BAD_SEED')
    }
    expectCode(() => luck(['ok', {} as unknown as Seed]), 'BAD_SEED')
    let deep: Seed = 'x'
    for (let i = 0; i < 40; i++) deep = [deep]
    expectCode(() => luck(deep), 'BAD_SEED')
  })

  it('change about half the key bits when the seed changes by one letter', () => {
    let total = 0
    let pairs = 0
    for (let i = 0; i < 500; i++) {
      const a = seedKey(`level-${i}`)
      const b = seedKey(`level-${i + 1}`)
      for (let w = 0; w < 4; w++) total += bitDiff(a[w] as number, b[w] as number)
      pairs++
    }
    const average = total / pairs
    expect(average).toBeGreaterThan(60)
    expect(average).toBeLessThan(68)
  })

  it('give unrelated first numbers for back-to-back seeds (level-1, level-2, …)', () => {
    const buckets = new Array<number>(16).fill(0)
    for (let i = 0; i < 16_000; i++) {
      const n = luck(`level-${i}`).uint32()
      buckets[n >>> 28] = (buckets[n >>> 28] as number) + 1
    }
    expect(chiSquare(buckets)).toBeLessThan(CHI_001[15] as number)
  })
})

describe('luck() with no seed', () => {
  it('picks a fresh, readable seed you can replay', () => {
    const run = luck()
    expect(typeof run.seed).toBe('string')
    expect(run.seed).toMatch(new RegExp(`^[${READABLE_ALPHABET}]{10}$`))
    const replay = luck(run.seed)
    expect(replay.uint32()).toBe(run.uint32())
  })

  it('picks a different seed each time', () => {
    const seeds = new Set(Array.from({ length: 200 }, () => luck().seed))
    expect(seeds.size).toBe(200)
  })

  it('still works without a secure random source', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(luck().seed).toMatch(/^[0-9a-z]{10}$/)
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved)
    }
  })
})
