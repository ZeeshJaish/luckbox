import { LuckboxError, show } from './errors.ts'
import type { Words4 } from './seed.ts'

/**
 * The random number generators luckbox can use.
 *
 * - `'sfc32'` (default): fast, small and passes the toughest statistical test suites
 * - `'xoshiro128**'`: a well-known alternative with the same quality
 * - `'mulberry32'`: the tiniest and fastest, fine for visuals and particles, weaker for heavy statistics
 */
export type Algorithm = 'sfc32' | 'xoshiro128**' | 'mulberry32'

/** The list of supported algorithms. */
export const ALGORITHMS: readonly Algorithm[] = ['sfc32', 'xoshiro128**', 'mulberry32']

/** A generator: gives unsigned 32-bit numbers and can save/load its words. */
export interface Generator {
  next(): number
  save(): number[]
  load(words: readonly number[]): void
}

/** How many unsigned 32-bit words each algorithm keeps. */
export const STATE_SIZE: Record<Algorithm, number> = { sfc32: 4, 'xoshiro128**': 4, mulberry32: 1 }

/** Small Fast Counting, by Chris Doty-Humphrey (from PractRand). */
class Sfc32 implements Generator {
  a = 0
  b = 0
  c = 0
  d = 0
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return t >>> 0
  }
  save(): number[] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]
  }
  load(w: readonly number[]): void {
    this.a = (w[0] as number) | 0
    this.b = (w[1] as number) | 0
    this.c = (w[2] as number) | 0
    this.d = (w[3] as number) | 0
  }
}

/** xoshiro128** 1.1, by David Blackman and Sebastiano Vigna. */
class Xoshiro128ss implements Generator {
  s0 = 0
  s1 = 0
  s2 = 0
  s3 = 0
  next(): number {
    const s1 = this.s1
    const m = Math.imul(s1, 5)
    const result = Math.imul((m << 7) | (m >>> 25), 9)
    const t = s1 << 9
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = (this.s3 << 11) | (this.s3 >>> 21)
    return result >>> 0
  }
  save(): number[] {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0]
  }
  load(w: readonly number[]): void {
    this.s0 = (w[0] as number) | 0
    this.s1 = (w[1] as number) | 0
    this.s2 = (w[2] as number) | 0
    this.s3 = (w[3] as number) | 0
    // An all-zero state would only ever give zeros.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1
  }
}

/** Mulberry32, by Tommy Ettinger. */
class Mulberry32 implements Generator {
  a = 0
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
  save(): number[] {
    return [this.a >>> 0]
  }
  load(w: readonly number[]): void {
    this.a = (w[0] as number) | 0
  }
}

/** Throws a helpful error for an unknown algorithm name. */
export function checkAlgorithm(name: unknown): Algorithm {
  if (typeof name === 'string' && (ALGORITHMS as readonly string[]).includes(name)) return name as Algorithm
  throw new LuckboxError(
    'BAD_ALGORITHM',
    `unknown algorithm ${show(name)}. Use one of: ${ALGORITHMS.map((a) => `'${a}'`).join(', ')}.`,
  )
}

/** An empty generator of the given algorithm (its words are all zero). */
export function createGenerator(algorithm: Algorithm): Generator {
  switch (algorithm) {
    case 'sfc32':
      return new Sfc32()
    case 'xoshiro128**':
      return new Xoshiro128ss()
    case 'mulberry32':
      return new Mulberry32()
  }
}

/** Numbers thrown away after seeding so that similar seeds drift fully apart. */
const WARM_UP = 16

/**
 * A generator seeded from a 128-bit key, warmed up and ready.
 * Locked: changing this would change every seeded result.
 */
export function generatorFromKey(algorithm: Algorithm, key: Words4): Generator {
  const gen = createGenerator(algorithm)
  if (algorithm === 'mulberry32') gen.load([key[0] ^ key[1] ^ key[2] ^ key[3]])
  else gen.load(key)
  for (let i = 0; i < WARM_UP; i++) gen.next()
  return gen
}
