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
  return [rng.uint32(), rng.int(1, 6), rng.float(), rng.shuffle([1, 2, 3, 4]), rng.uuid(), saved.uint32(), luck.daily({ date: '2026-11-26' }).seed]
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

  it('ships type definitions for both formats', () => {
    expect(existsSync(dist('index.d.ts'))).toBe(true)
    expect(existsSync(dist('index.d.cts'))).toBe(true)
  })
})
