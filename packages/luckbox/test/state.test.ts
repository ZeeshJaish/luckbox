import { describe, expect, it } from 'vitest'
import { ALGORITHMS, type Algorithm, type Rng, type RngState, luck } from '../src/index.ts'
import { CHI_001, chiSquare, expectCode } from './helpers.ts'

const next = (rng: Rng, n = 20): number[] => Array.from({ length: n }, () => rng.uint32())

describe.each(ALGORITHMS)('save and load (%s)', (algorithm: Algorithm) => {
  it('continues exactly where it stopped', () => {
    const rng = luck('save-me', { algorithm })
    next(rng, 37)
    const saved = rng.state()
    const expected = next(rng)
    expect(next(luck.from(saved))).toEqual(expected)
  })

  it('survives JSON, as an object or as text', () => {
    const rng = luck('json', { algorithm })
    rng.float()
    const text = JSON.stringify(rng)
    const expected = next(rng.clone())
    expect(next(luck.from(text))).toEqual(expected)
    expect(next(luck.from(JSON.parse(text) as RngState))).toEqual(expected)
  })

  it('keeps the draw count and the algorithm', () => {
    const rng = luck('count', { algorithm })
    next(rng, 5)
    const back = luck.from(rng.state())
    expect(back.draws).toBe(5)
    expect(back.algorithm).toBe(algorithm)
  })
})

describe('state()', () => {
  it('is plain JSON with the seed for showing players', () => {
    const s = luck('my-seed').state()
    expect(s.version).toBe(1)
    expect(s.algorithm).toBe('sfc32')
    expect(s.key).toHaveLength(4)
    expect(s.words).toHaveLength(4)
    expect(s.seed).toBe('my-seed')
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    expect(luck.from(s).seed).toBe('my-seed')
  })

  it('stores bigint seeds as text, which seeds the same', () => {
    const s = luck(['big', 2n ** 70n]).state()
    expect(s.seed).toEqual(['big', String(2n ** 70n)])
    expect(next(luck(s.seed as string[]))).toEqual(next(luck(['big', 2n ** 70n])))
  })

  it('has no seed for forks', () => {
    expect(luck('x').fork('a').state().seed).toBeUndefined()
    expect(luck('x').fork('a').seed).toBeUndefined()
  })
})

describe('luck.from() explains bad saves with BAD_STATE', () => {
  const good = (): RngState => luck('good').state()
  const cases: Array<[string, unknown]> = [
    ['text that is not JSON', '{oops'],
    ['null', null],
    ['a number', 5],
    ['a wrong version', { ...good(), version: 2 }],
    ['an unknown algorithm', { ...good(), algorithm: 'mt19937' }],
    ['a short key', { ...good(), key: [1, 2, 3] }],
    ['a key with a decimal', { ...good(), key: [1, 2, 3, 4.5] }],
    ['words of the wrong length', { ...good(), words: [1, 2] }],
    ['a negative word', { ...good(), words: [1, 2, 3, -4] }],
    ['a word over 32 bits', { ...good(), words: [1, 2, 3, 2 ** 32] }],
    ['negative draws', { ...good(), draws: -1 }],
    ['missing draws', { ...good(), draws: undefined }],
    ['all-zero xoshiro words', { ...luck('z', { algorithm: 'xoshiro128**' }).state(), words: [0, 0, 0, 0] }],
    ['a broken seed', { ...good(), seed: { no: 1 } }],
  ]
  it.each(cases)('%s', (_name, state) => {
    expectCode(() => luck.from(state as RngState), 'BAD_STATE')
  })
})

describe('clone()', () => {
  it('gives the same numbers without moving the original', () => {
    const rng = luck('clone')
    next(rng, 3)
    const copy = rng.clone()
    expect(next(copy)).toEqual(next(rng))
    expect(copy.draws).toBe(rng.draws)
    expect(copy.seed).toBe('clone')
  })

  it('is independent after copying', () => {
    const rng = luck('independent')
    const copy = rng.clone()
    next(copy, 100)
    expect(rng.draws).toBe(0)
  })
})

describe('fork(name)', () => {
  it('does not depend on how many numbers the parent drew', () => {
    const fresh = luck('world').fork('enemies')
    const busy = luck('world')
    next(busy, 1_234)
    busy.float()
    expect(next(busy.fork('enemies'))).toEqual(next(fresh))
  })

  it('does not move the parent', () => {
    const rng = luck('world')
    rng.fork('loot')
    expect(rng.draws).toBe(0)
  })

  it('gives each name its own stream', () => {
    const rng = luck('world')
    const names = ['loot', 'weather', 'enemies', 'loot2', '']
    const firsts = names.map((n) => rng.fork(n).uint32())
    expect(new Set(firsts).size).toBe(names.length)
    expect(rng.fork('loot').uint32()).not.toBe(luck('loot').uint32())
  })

  it('nests: rng.fork("level").fork(3)', () => {
    const a = luck('world').fork('level').fork(3)
    const b = luck('world').fork('level').fork(3)
    expect(next(a)).toEqual(next(b))
    expect(luck('world').fork('level').fork(3).uint32()).not.toBe(luck('world').fork('level').fork(4).uint32())
  })

  it('treats fork(3) and fork("3") the same', () => {
    expect(luck('w').fork(3).uint32()).toBe(luck('w').fork('3').uint32())
  })

  it('works the same after save/load and clone', () => {
    const rng = luck('world')
    next(rng, 10)
    const expected = next(rng.fork('boss'))
    expect(next(luck.from(rng.state()).fork('boss'))).toEqual(expected)
    expect(next(rng.clone().fork('boss'))).toEqual(expected)
  })

  it('keeps the algorithm', () => {
    expect(luck('w', { algorithm: 'mulberry32' }).fork('a').algorithm).toBe('mulberry32')
  })

  it('gives unrelated first numbers for back-to-back names (chunk-0, chunk-1, …)', () => {
    const rng = luck('world')
    const buckets = new Array<number>(16).fill(0)
    for (let i = 0; i < 16_000; i++) {
      const n = rng.fork(i).uint32()
      buckets[n >>> 28] = (buckets[n >>> 28] as number) + 1
    }
    expect(chiSquare(buckets)).toBeLessThan(CHI_001[15] as number)
  })

  it('explains bad names', () => {
    const rng = luck('w')
    for (const bad of [null, undefined, {}, Number.NaN, ['a']]) {
      expectCode(() => rng.fork(bad as unknown as string), 'BAD_ARGUMENT')
    }
  })
})

describe('luck.from() messages', () => {
  it('say how many words each algorithm needs', () => {
    const s = luck('m', { algorithm: 'mulberry32' }).state()
    expect(() => luck.from({ ...s, words: [1, 2] })).toThrow('"words" must be 1 whole number for mulberry32')
    expect(() => luck.from({ ...luck('s').state(), words: [1] })).toThrow('"words" must be 4 whole numbers for sfc32')
  })
})
