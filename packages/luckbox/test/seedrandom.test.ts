// luckbox/seedrandom must give exactly the same numbers as the real seedrandom package.
import realSeedrandom from 'seedrandom'
import { describe, expect, it } from 'vitest'
import { type SeedrandomState, seedrandom } from '../src/seedrandom.ts'
import { expectCode } from './helpers.ts'

const SEEDS: unknown[] = ['hello.', '', 'a', 'luckbox', '🎲 मुंबई', 42, 0, -1.5, 1e21, true, [1, 'two', [3]], { a: 1, b: [2, 3] }, 'x'.repeat(1000)]
for (let i = 0; i < 200; i++) SEEDS.push(`seed-${i}`)

describe('luckbox/seedrandom', () => {
  it('matches the real seedrandom for every seed and method', () => {
    for (const seed of SEEDS) {
      const real = realSeedrandom(seed as string)
      const ours = seedrandom(seed)
      for (let n = 0; n < 150; n++) {
        if (n % 3 === 0) expect(ours()).toBe(real())
        else if (n % 3 === 1) expect(ours.int32()).toBe(real.int32())
        else expect(ours.quick()).toBe(real.quick())
      }
      expect(ours.double()).toBe(real.double())
    }
  })

  it('gives the README example from seedrandom', () => {
    expect(seedrandom('hello.')()).toBe(0.9282578795792454)
  })

  it('saves and loads state, and swaps state with the real package', () => {
    const ours = seedrandom('save', { state: true })
    for (let i = 0; i < 10; i++) ours()
    const state = ours.state()
    const copy = seedrandom('anything', { state })
    expect(Array.from({ length: 20 }, () => copy())).toEqual(Array.from({ length: 20 }, () => ours()))
    const real = realSeedrandom('save', { state: true })
    for (let i = 0; i < 30; i++) real()
    const fromReal = seedrandom('', { state: real.state() as SeedrandomState })
    expect(Array.from({ length: 20 }, () => fromReal())).toEqual(Array.from({ length: 20 }, () => real()))
  })

  it('explains mistakes', () => {
    expectCode(() => seedrandom(undefined), 'BAD_SEED')
    expectCode(() => seedrandom(null), 'BAD_SEED')
    expectCode(() => seedrandom('x', 'y' as never), 'BAD_ARGUMENT')
    expectCode(() => seedrandom('x').state(), 'BAD_ARGUMENT')
    expectCode(() => seedrandom('x', { state: { i: 0, j: 0, S: [1, 2] } }), 'BAD_STATE')
    expectCode(() => seedrandom('x', { state: { i: 300, j: 0, S: new Array(256).fill(0) } }), 'BAD_STATE')
  })

  it('skips object properties that throw, like seedrandom', () => {
    const tricky = { ok: 1, get bad(): number { throw new Error('no') } }
    expect(seedrandom(tricky)()).toBe(realSeedrandom(tricky as never)())
  })
})
