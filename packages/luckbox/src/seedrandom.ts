/*
 * luckbox/seedrandom: a drop-in replacement for the `seedrandom` package's
 * default generator (ARC4, by David Bau, MIT licence). Same seed, same
 * numbers, so games can switch without their worlds changing.
 *
 * Written from the published algorithm and checked against the real package.
 */
import { LuckboxError, show } from './errors.ts'

const WIDTH = 256
const MASK = WIDTH - 1
const CHUNKS = 6
const START_DENOM = WIDTH ** CHUNKS // 2^48
const SIGNIFICANCE = 2 ** 52
const OVERFLOW = SIGNIFICANCE * 2

/** The saved position of a seedrandom generator (same shape as seedrandom's). */
export interface SeedrandomState {
  i: number
  j: number
  S: number[]
}

/** Options, matching seedrandom's. */
export interface SeedrandomOptions {
  /** `true` to enable `prng.state()`, or a saved state to continue from. */
  state?: boolean | SeedrandomState
}

/** A seedrandom-compatible generator: call it for a decimal from 0 to 1. */
export interface SeedrandomPrng {
  /** A decimal from 0 up to (not including) 1 with 52 bits of randomness, exactly like seedrandom's `rng()`. */
  (): number
  /** The same as calling the generator. */
  double(): number
  /** A signed 32-bit whole number. */
  int32(): number
  /** A decimal from 0 to 1 with 32 bits of randomness (faster). */
  quick(): number
  /** The saved position (only when created with `{ state: true }` or a state). */
  state(): SeedrandomState
}

class Arc4 {
  i = 0
  j = 0
  S: number[] = []

  constructor(key: number[]) {
    let keylen = key.length
    if (!keylen) key = [keylen++]
    const s = this.S
    for (let i = 0; i < WIDTH; i++) s[i] = i
    let j = 0
    for (let i = 0; i < WIDTH; i++) {
      const t = s[i] as number
      j = MASK & (j + (key[i % keylen] as number) + t)
      s[i] = s[j] as number
      s[j] = t
    }
    this.g(WIDTH) // throw away the first 256 bytes (RC4-drop[256])
  }

  g(count: number): number {
    let r = 0
    let i = this.i
    let j = this.j
    const s = this.S
    while (count--) {
      i = MASK & (i + 1)
      const t = s[i] as number
      j = MASK & (j + t)
      s[i] = s[j] as number
      s[j] = t
      r = r * WIDTH + (s[MASK & ((s[i] as number) + t)] as number)
    }
    this.i = i
    this.j = j
    return r
  }
}

/** seedrandom's `flatten`: numbers become text with a trailing \0, objects are walked 3 deep. */
function flatten(obj: unknown, depth: number): unknown {
  const result: unknown[] = []
  if (depth && typeof obj === 'object' && obj !== null) {
    for (const prop in obj as Record<string, unknown>) {
      try {
        result.push(flatten((obj as Record<string, unknown>)[prop], depth - 1))
      } catch {
        // seedrandom skips properties that throw
      }
    }
  }
  return result.length ? result : typeof obj === 'string' ? obj : `${String(obj)}\0`
}

/** seedrandom's `mixkey`: folds the seed text into a 256-byte key. */
function mixkey(seed: unknown, key: number[]): void {
  const text = String(seed)
  let smear = 0
  for (let j = 0; j < text.length; j++) {
    smear ^= ((key[MASK & j] ?? 0) as number) * 19
    key[MASK & j] = MASK & (smear + text.charCodeAt(j))
  }
}

/**
 * Creates a generator that gives exactly the same numbers as
 * `seedrandom(seed)` from the `seedrandom` package.
 *
 * @example
 * // before: import seedrandom from 'seedrandom'
 * import { seedrandom } from 'luckbox/seedrandom'
 * const rng = seedrandom('hello.')
 * rng() // 0.9282578795792454, the same as seedrandom
 */
export function seedrandom(seed: unknown, options: SeedrandomOptions = {}): SeedrandomPrng {
  if (seed === undefined || seed === null) {
    throw new LuckboxError('BAD_SEED', 'seedrandom(seed) needs a seed. (Auto-seeding is not supported: use luck() for a fresh, replayable seed.)')
  }
  if (options === null || typeof options !== 'object') {
    throw new LuckboxError('BAD_ARGUMENT', `seedrandom(seed, options) needs options like { state: true }, got ${show(options)}.`)
  }
  const key: number[] = []
  mixkey(flatten(seed, 3), key)
  const arc4 = new Arc4(key)
  const saved = options.state
  if (saved !== undefined && typeof saved === 'object') {
    const ok =
      saved !== null &&
      Number.isInteger(saved.i) && saved.i >= 0 && saved.i < WIDTH &&
      Number.isInteger(saved.j) && saved.j >= 0 && saved.j < WIDTH &&
      Array.isArray(saved.S) && saved.S.length === WIDTH && saved.S.every((v) => Number.isInteger(v) && v >= 0 && v < WIDTH)
    if (!ok) throw new LuckboxError('BAD_STATE', 'seedrandom(): this saved state can\'t be loaded: it needs { i, j, S } from prng.state().')
    arc4.i = saved.i
    arc4.j = saved.j
    arc4.S = [...saved.S]
  }
  const prng = (): number => {
    let n = arc4.g(CHUNKS)
    let d = START_DENOM
    let x = 0
    while (n < SIGNIFICANCE) {
      n = (n + x) * WIDTH
      d *= WIDTH
      x = arc4.g(1)
    }
    while (n >= OVERFLOW) {
      n /= 2
      d /= 2
      x >>>= 1
    }
    return (n + x) / d
  }
  const withState = saved !== undefined && saved !== false
  return Object.assign(prng, {
    double: prng,
    int32: (): number => arc4.g(4) | 0,
    quick: (): number => arc4.g(4) / 0x100000000,
    state: (): SeedrandomState => {
      if (!withState) throw new LuckboxError('BAD_ARGUMENT', 'state() needs the generator to be made with seedrandom(seed, { state: true }).')
      return { i: arc4.i, j: arc4.j, S: [...arc4.S] }
    },
  })
}
