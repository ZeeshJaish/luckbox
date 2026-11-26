// Checks the built files that npm users actually get, in every format.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { luck as source } from '../src/index.ts'

const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url))
interface Built {
  VERSION: string
  luck: typeof source
}

/** The same calls on any build must give the same numbers as the source. */
const fingerprint = (luck: typeof source): unknown => {
  const rng = luck('build-check')
  const saved = luck.from(JSON.stringify(rng.fork('f')))
  const bag = rng.bag(['a', 'b', 'c'])
  return [
    rng.uint32(), rng.int(1, 6), rng.float(), rng.shuffle([1, 2, 3, 4]), rng.uuid(), saved.uint32(),
    luck.daily({ date: '2026-11-26' }).seed,
    rng.roll('4d6kh3+2'), rng.dice('3d6!').text, rng.weighted({ x: 1, y: 2 }), rng.loot({ a: 1, b: 1 }).open(),
    [bag.next(), bag.next(), bag.next()], rng.deck([1, 2, 3]).drawMany(3), luck.odds('2d6').chance(7),
  ]
}
const expected = fingerprint(source)

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}

describe('built package', () => {
  it('works with import (ESM)', async () => {
    const mod = (await import(dist('index.js'))) as Built
    expect(mod.VERSION).toBe(pkg.version)
    expect(fingerprint(mod.luck)).toEqual(expected)
  })

  it('works with require (CommonJS)', () => {
    const require = createRequire(import.meta.url)
    const mod = require(dist('index.cjs')) as Built
    expect(mod.VERSION).toBe(pkg.version)
    expect(fingerprint(mod.luck)).toEqual(expected)
  })

  it('works as a <script> tag (sets window.luckbox)', () => {
    const code = readFileSync(dist('luckbox.min.js'), 'utf8')
    // A classic <script> runs with the page's global object; top-level names land on it.
    const page: Record<string, unknown> = {}
    runInNewContext(code, page)
    const luckbox = page.luckbox as Built | undefined
    expect(luckbox?.VERSION).toBe(pkg.version)
    // Arrays from another context have a different Array prototype, so compare as JSON.
    expect(JSON.stringify(fingerprint((luckbox as Built).luck))).toBe(JSON.stringify(expected))
  })

  it('add-ons load through the package exports (luckbox/noise, luckbox/seedrandom)', async () => {
    const noiseEsm = (await import('luckbox/noise')) as typeof import('../src/noise.ts')
    const srEsm = (await import('luckbox/seedrandom')) as typeof import('../src/seedrandom.ts')
    const require = createRequire(import.meta.url)
    const noiseCjs = require('luckbox/noise') as typeof import('../src/noise.ts')
    const srCjs = require('luckbox/seedrandom') as typeof import('../src/seedrandom.ts')
    const { createNoise } = await import('../src/noise.ts')
    const { seedrandom } = await import('../src/seedrandom.ts')
    const want = createNoise('n').noise2d(1.5, 2.5)
    expect(noiseEsm.createNoise('n').noise2d(1.5, 2.5)).toBe(want)
    expect(noiseCjs.createNoise('n').noise2d(1.5, 2.5)).toBe(want)
    expect(srEsm.seedrandom('hello.')()).toBe(seedrandom('hello.')())
    expect(srCjs.seedrandom('hello.')()).toBe(0.9282578795792454)
  })

  it('the script tag build includes the add-ons', () => {
    const page: Record<string, unknown> = {}
    runInNewContext(readFileSync(dist('luckbox.min.js'), 'utf8'), page)
    const lb = page.luckbox as { createNoise: (s: string) => { noise2d(x: number, y: number): number }; seedrandom: (s: string) => () => number }
    expect(lb.seedrandom('hello.')()).toBe(0.9282578795792454)
    expect(typeof lb.createNoise('n').noise2d(1, 2)).toBe('number')
  })

  it('ships type definitions for both formats', () => {
    for (const name of ['index', 'noise', 'seedrandom']) {
      expect(existsSync(dist(`${name}.d.ts`))).toBe(true)
      expect(existsSync(dist(`${name}.d.cts`))).toBe(true)
    }
  })
})
