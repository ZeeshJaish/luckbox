/*
 * luckbox/noise: seeded simplex noise in 2D and 3D, with layered (fbm) noise
 * for terrain, clouds, caves and wobbly motion.
 *
 * Simplex noise after Stefan Gustavson's public domain reference. Uses only
 * + − × ÷ and floor, so the same seed gives the same map on every engine.
 */
import { LuckboxError, show } from './errors.ts'
import { generatorFromKey } from './generators.ts'
import { type Seed, forkKey, seedKey } from './seed.ts'

/** Options for layered noise (`fbm2d`, `fbm3d`). */
export interface FbmOptions {
  /** How many layers to add. More = more detail. Default: 4. */
  octaves?: number
  /** How much finer each layer is than the last. Default: 2. */
  lacunarity?: number
  /** How much weaker each layer is than the last. Default: 0.5. */
  gain?: number
  /** The scale of the first layer. Default: 1. */
  frequency?: number
}

/** A seeded noise field. Every method returns a smooth value from −1 to 1. */
export interface Noise {
  /** Smooth 2D noise from −1 to 1. Nearby points give nearby values. */
  noise2d(x: number, y: number): number
  /** Smooth 3D noise from −1 to 1 (use z as time for animated 2D noise). */
  noise3d(x: number, y: number, z: number): number
  /** Layered 2D noise from −1 to 1: big shapes plus fine detail, like terrain. */
  fbm2d(x: number, y: number, options?: FbmOptions): number
  /** Layered 3D noise from −1 to 1. */
  fbm3d(x: number, y: number, z: number, options?: FbmOptions): number
}

const GRAD3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]
const F2 = 0.36602540378443865 // (√3 − 1) / 2
const G2 = 0.21132486540518713 // (3 − √3) / 6
const F3 = 1 / 3
const G3 = 1 / 6

function checkCoords(values: readonly number[], method: string): void {
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new LuckboxError('BAD_ARGUMENT', `${method} needs finite numbers, got ${show(v)}.`)
    }
  }
}

function readFbm(options: FbmOptions | undefined, method: string): Required<FbmOptions> {
  if (options !== undefined && (options === null || typeof options !== 'object')) {
    throw new LuckboxError('BAD_ARGUMENT', `${method} options must be an object like { octaves: 5 }, got ${show(options)}.`)
  }
  const { octaves = 4, lacunarity = 2, gain = 0.5, frequency = 1 } = options ?? {}
  if (!Number.isSafeInteger(octaves) || octaves < 1 || octaves > 16) {
    throw new LuckboxError('BAD_ARGUMENT', `${method} octaves must be a whole number from 1 to 16, got ${show(octaves)}.`)
  }
  for (const [name, v] of [['lacunarity', lacunarity], ['gain', gain], ['frequency', frequency]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new LuckboxError('BAD_ARGUMENT', `${method} ${name} must be a number above 0, got ${show(v)}.`)
    }
  }
  return { octaves, lacunarity, gain, frequency }
}

/**
 * Makes a seeded noise field. Pass a seed, or an Rng (it uses a fork named
 * 'noise', so it never moves the Rng). `createNoise(seed)` gives the same
 * field as `createNoise(luck(seed))`.
 *
 * @example
 * import { createNoise } from 'luckbox/noise'
 * const noise = createNoise('world-1')
 * const height = noise.fbm2d(x / 100, y / 100) // −1 to 1
 * const tile = height > 0.3 ? 'mountain' : height > 0 ? 'grass' : 'water'
 */
export function createNoise(source?: Seed | { fork(name: string): { uint32(): number } }): Noise {
  let next: () => number
  if (source !== null && typeof source === 'object' && !Array.isArray(source) && typeof (source as { fork?: unknown }).fork === 'function') {
    const stream = (source as { fork(name: string): { uint32(): number } }).fork('noise')
    next = () => stream.uint32()
  } else {
    if (source === undefined) throw new LuckboxError('BAD_SEED', 'createNoise(seed) needs a seed or an Rng, so the same map comes back every time.')
    const gen = generatorFromKey('sfc32', forkKey(seedKey(source as Seed), 'noise'))
    next = () => gen.next()
  }

  // A shuffled 0..255, the same way rng.shuffleInPlace does it (no modulo bias).
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const n = i + 1
    const limit = 0x100000000 - (0x100000000 % n)
    let x = next()
    while (x >= limit) x = next()
    const j = x % n
    const t = p[i] as number
    p[i] = p[j] as number
    p[j] = t
  }
  const perm = new Uint8Array(512)
  const mod12 = new Uint8Array(512)
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255] as number
    mod12[i] = (perm[i] as number) % 12
  }

  const noise2d = (xin: number, yin: number): number => {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    let n = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = (mod12[ii + (perm[jj] as number)] as number) * 3
      t0 *= t0
      n += t0 * t0 * ((GRAD3[g] as number) * x0 + (GRAD3[g + 1] as number) * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = (mod12[ii + i1 + (perm[jj + j1] as number)] as number) * 3
      t1 *= t1
      n += t1 * t1 * ((GRAD3[g] as number) * x1 + (GRAD3[g + 1] as number) * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = (mod12[ii + 1 + (perm[jj + 1] as number)] as number) * 3
      t2 *= t2
      n += t2 * t2 * ((GRAD3[g] as number) * x2 + (GRAD3[g + 1] as number) * y2)
    }
    return 70 * n
  }

  const noise3d = (xin: number, yin: number, zin: number): number => {
    const s = (xin + yin + zin) * F3
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const k = Math.floor(zin + s)
    const t = (i + j + k) * G3
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const z0 = zin - (k - t)
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]
    const corners = [
      [x0, y0, z0, 0, 0, 0],
      [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1],
      [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2],
      [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1],
    ] as const
    const ii = i & 255
    const jj = j & 255
    const kk = k & 255
    let n = 0
    for (const [x, y, z, di, dj, dk] of corners) {
      let tt = 0.6 - x * x - y * y - z * z
      if (tt <= 0) continue
      const g = (mod12[ii + di + (perm[jj + dj + (perm[kk + dk] as number)] as number)] as number) * 3
      tt *= tt
      n += tt * tt * ((GRAD3[g] as number) * x + (GRAD3[g + 1] as number) * y + (GRAD3[g + 2] as number) * z)
    }
    return 32 * n
  }

  const fbm = (sample: (f: number) => number, o: Required<FbmOptions>): number => {
    let sum = 0
    let amplitude = 1
    let norm = 0
    let f = o.frequency
    for (let octave = 0; octave < o.octaves; octave++) {
      sum += amplitude * sample(f)
      norm += amplitude
      amplitude *= o.gain
      f *= o.lacunarity
    }
    return sum / norm
  }

  return Object.freeze({
    noise2d(x: number, y: number): number {
      checkCoords([x, y], 'noise2d(x, y)')
      return noise2d(x, y)
    },
    noise3d(x: number, y: number, z: number): number {
      checkCoords([x, y, z], 'noise3d(x, y, z)')
      return noise3d(x, y, z)
    },
    fbm2d(x: number, y: number, options?: FbmOptions): number {
      checkCoords([x, y], 'fbm2d(x, y)')
      return fbm((f) => noise2d(x * f, y * f), readFbm(options, 'fbm2d()'))
    },
    fbm3d(x: number, y: number, z: number, options?: FbmOptions): number {
      checkCoords([x, y, z], 'fbm3d(x, y, z)')
      return fbm((f) => noise3d(x * f, y * f, z * f), readFbm(options, 'fbm3d()'))
    },
  })
}
