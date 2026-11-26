// Checks the built files that npm users actually get, in every format.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}

describe('built package', () => {
  it('works with import (ESM)', async () => {
    const mod = (await import(dist('index.js'))) as { VERSION: string }
    expect(mod.VERSION).toBe(pkg.version)
  })

  it('works with require (CommonJS)', () => {
    const require = createRequire(import.meta.url)
    const mod = require(dist('index.cjs')) as { VERSION: string }
    expect(mod.VERSION).toBe(pkg.version)
  })

  it('works as a <script> tag (sets window.luckbox)', () => {
    const code = readFileSync(dist('luckbox.min.js'), 'utf8')
    // A classic <script> runs with the page's global object; top-level names land on it.
    const page: Record<string, unknown> = {}
    runInNewContext(code, page)
    const luckbox = page.luckbox as { VERSION: string } | undefined
    expect(luckbox?.VERSION).toBe(pkg.version)
  })

  it('ships type definitions for both formats', () => {
    expect(existsSync(dist('index.d.ts'))).toBe(true)
    expect(existsSync(dist('index.d.cts'))).toBe(true)
  })
})
