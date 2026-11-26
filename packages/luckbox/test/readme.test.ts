// Keeps the README honest: every ```js block runs, and every line ending in
// a comment that starts with a value (// 2, // 'staff', // true) must give
// exactly that value. Illustrative snippets use ```javascript and are skipped.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as luckbox from '../src/index.ts'
import { createNoise } from '../src/noise.ts'
import { names } from '../src/names.ts'
import { seedrandom } from '../src/seedrandom.ts'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const blocks = [...readme.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1] as string)
const LITERAL = /^(-?\d+(?:\.\d+)?(?:e-?\d+)?|'[^']*'|true|false)(?=$|[\s:,(])/

function compile(block: string): { source: string; checks: number } {
  let checks = 0
  const lines = block.split('\n').map((line) => {
    if (/^\s*import /.test(line)) return ''
    const m = /^(.*?\S)\s+\/\/\s*(.*)$/.exec(line)
    if (!m) return line
    const code = m[1] as string
    const literal = LITERAL.exec((m[2] as string).trim())?.[1]
    const isExpression = !/^\s*(const|let|var|if|for|return|\}|\{)/.test(code) && !/[{(,]\s*$/.test(code)
    if (!literal || !isExpression) return code
    checks++
    return `check(${JSON.stringify(code.trim())}, (${code.trim()}), ${literal})`
  })
  return { source: lines.join('\n'), checks }
}

describe('README examples', () => {
  it('has runnable examples', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6)
  })

  it.each(blocks.map((b, i) => [i + 1, b] as const))('block %i runs and shows real values', (_i, block) => {
    const { source } = compile(block)
    const failures: string[] = []
    const check = (code: string, got: unknown, want: unknown): void => {
      if (!Object.is(got, want)) failures.push(`${code} gave ${JSON.stringify(got)}, README says ${JSON.stringify(want)}`)
    }
    const run = new Function('luck', 'createNoise', 'seedrandom', 'names', 'check', source)
    run(luckbox.luck, createNoise, seedrandom, names, check)
    expect(failures).toEqual([])
  })

  it('checks a good number of values', () => {
    const total = blocks.reduce((n, b) => n + compile(b).checks, 0)
    expect(total).toBeGreaterThanOrEqual(15)
  })
})
