import { LuckboxError, show } from './errors.ts'

/**
 * Anything you can seed luckbox with.
 *
 * - Text: `'level-3'`, `'daily:2026-11-26'`
 * - Numbers: `42` (the same as `'42'`, so seeds from URLs match seeds in code)
 * - Lists, for things like world chunks: `[worldSeed, chunkX, chunkY]`
 */
export type Seed = string | number | bigint | readonly Seed[]

/** 128 bits as four unsigned 32-bit words. */
export type Words4 = [number, number, number, number]

/**
 * Pushes the UTF-8 bytes of a string. Written out by hand so it works the same
 * everywhere, even where TextEncoder is missing. Lone surrogates become U+FFFD,
 * exactly like TextEncoder.
 */
function pushUtf8(text: string, out: number[]): void {
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdfff) {
      const next = text.charCodeAt(i + 1)
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00)
        i++
      } else {
        c = 0xfffd
      }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
}

/**
 * Turns a seed into bytes, the same way on every device.
 * Strings (and numbers, as their text) are plain UTF-8. Lists start with
 * 0xFF 0xFE, bytes that never occur in UTF-8 text, so a list can never
 * collide with a string. Each item is prefixed with its length.
 */
export function seedBytes(seed: Seed): Uint8Array {
  const out: number[] = []
  write(seed, out, 0)
  return Uint8Array.from(out)
}

function write(seed: Seed, out: number[], depth: number): void {
  if (typeof seed === 'string') {
    pushUtf8(seed, out)
    return
  }
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) {
      throw new LuckboxError('BAD_SEED', `a number seed must be finite, got ${show(seed)}.`)
    }
    write(String(seed), out, depth)
    return
  }
  if (typeof seed === 'bigint') {
    write(String(seed), out, depth)
    return
  }
  if (Array.isArray(seed)) {
    if (depth > 32) throw new LuckboxError('BAD_SEED', 'seed lists can be nested at most 32 levels deep.')
    out.push(0xff, 0xfe)
    for (const item of seed as readonly Seed[]) {
      const part: number[] = []
      write(item, part, depth + 1)
      const n = part.length
      out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff)
      for (const b of part) out.push(b)
    }
    return
  }
  throw new LuckboxError(
    'BAD_SEED',
    `a seed must be text, a number, a bigint or a list of those, got ${show(seed)}.`,
  )
}

/** MurmurHash3's final mix: every input bit affects every output bit. */
function fmix32(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Hashes bytes to 128 bits. Four lanes, each mixed with a different odd
 * multiplier and fed by its neighbour (the cyrb128 layout), then the length
 * is folded in and each lane is avalanched with fmix32.
 *
 * Locked: changing this would change every seeded result, so it never changes.
 */
export function hash128(bytes: Uint8Array): Words4 {
  let h1 = 0x6a09e667
  let h2 = 0xbb67ae85
  let h3 = 0x3c6ef372
  let h4 = 0xa54ff53a
  for (let i = 0; i < bytes.length; i++) {
    const k = bytes[i] as number
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  const len = bytes.length >>> 0
  h1 = Math.imul(h3 ^ (h1 >>> 18) ^ len, 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [fmix32(h1), fmix32(h2 ^ 0x9e3779b9), fmix32(h3 ^ 0x7f4a7c15), fmix32(h4 ^ 0x94d049bb)]
}

/** The 128-bit key for a seed. */
export function seedKey(seed: Seed): Words4 {
  return hash128(seedBytes(seed))
}

/** The key for `fork(name)`: depends only on the parent's key and the name. */
export function forkKey(parent: Words4, name: string | number): Words4 {
  if (typeof name !== 'string' && !(typeof name === 'number' && Number.isFinite(name))) {
    throw new LuckboxError('BAD_ARGUMENT', `fork(name) needs text or a number, got ${show(name)}.`)
  }
  const tail = seedBytes(['luckbox:fork', String(name)])
  const bytes = new Uint8Array(16 + tail.length)
  for (let i = 0; i < 4; i++) {
    const w = parent[i] as number
    bytes[i * 4] = w >>> 24
    bytes[i * 4 + 1] = (w >>> 16) & 0xff
    bytes[i * 4 + 2] = (w >>> 8) & 0xff
    bytes[i * 4 + 3] = w & 0xff
  }
  bytes.set(tail, 16)
  return hash128(bytes)
}

/** Readable letters for codes players may type: no i, l, o or u. */
export const READABLE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * A fresh random seed from the device's secure random source, as a short
 * readable code like `"k3f9x2pqm7"` that players can share.
 */
export function freshSeed(): string {
  const crypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  const bytes = new Uint8Array(10)
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (const b of bytes) out += READABLE_ALPHABET[b & 31]
  return out
}
