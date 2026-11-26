// The JavaScript generators must match the C reference versions bit for bit.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALGORITHMS, type Algorithm, createGenerator } from '../src/generators.ts'

interface Vector {
  start: number[]
  outputs: number[]
  end: number[]
}
const vectors = JSON.parse(
  readFileSync(new URL('./reference/vectors.json', import.meta.url), 'utf8'),
) as Record<Algorithm, Vector[]>

const words = (alg: Algorithm, w: number[]): number[] => (alg === 'mulberry32' ? w.slice(0, 1) : w)

describe.each(ALGORITHMS)('%s matches the C reference', (alg) => {
  it.each(vectors[alg].map((v, i) => [i, v] as const))('start #%i', (_i, v) => {
    const gen = createGenerator(alg)
    gen.load(words(alg, v.start))
    const got = v.outputs.map(() => gen.next())
    expect(got).toEqual(v.outputs)
    expect(gen.save()).toEqual(words(alg, v.end))
  })
})

describe('xoshiro128**', () => {
  it('gives the numbers published by its authors for state [1, 2, 3, 4]', () => {
    const gen = createGenerator('xoshiro128**')
    gen.load([1, 2, 3, 4])
    expect([gen.next(), gen.next(), gen.next(), gen.next()]).toEqual([11520, 0, 5927040, 70819200])
  })

  it('never gets stuck on an all-zero state', () => {
    const gen = createGenerator('xoshiro128**')
    gen.load([0, 0, 0, 0])
    const outs = Array.from({ length: 8 }, () => gen.next())
    expect(outs.some((n) => n !== 0)).toBe(true)
  })
})

describe('every generator', () => {
  it.each(ALGORITHMS)('%s gives unsigned 32-bit whole numbers', (alg) => {
    const gen = createGenerator(alg)
    gen.load([0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321])
    for (let i = 0; i < 10_000; i++) {
      const n = gen.next()
      expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true)
    }
  })
})
