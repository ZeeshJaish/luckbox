// AI agents and search engines read AGENTS.md and llms.txt, so every method
// they mention must really exist.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Rng, luck } from '../src/index.ts'
import { createNoise } from '../src/noise.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const names = (text: string, prefix: string): string[] =>
  [...new Set([...text.matchAll(new RegExp(`\\b${prefix}\\.([a-zA-Z0-9]+)\\b`, 'g'))].map((m) => m[1] as string))]

describe('docs for AI tools only name real APIs', () => {
  for (const file of ['AGENTS.md', 'llms.txt', 'README.md']) {
    it(`${file}: every rng.method exists`, () => {
      const rng = luck('docs') as unknown as Record<string, unknown>
      for (const name of names(read(file), 'rng')) expect(name in rng, `rng.${name}`).toBe(true)
    })
    it(`${file}: every luck.method exists`, () => {
      for (const name of names(read(file), 'luck')) expect(name in luck, `luck.${name}`).toBe(true)
    })
  }

  it('AGENTS.md: noise methods exist', () => {
    const noise = createNoise('x') as unknown as Record<string, unknown>
    for (const name of ['noise2d', 'noise3d', 'fbm2d', 'fbm3d']) expect(read('AGENTS.md')).toContain(name)
    for (const name of names(read('AGENTS.md'), 'noise').filter((n) => n !== 'js')) expect(name in noise, `noise.${name}`).toBe(true)
  })

  it('every public Rng method is mentioned in AGENTS.md', () => {
    const doc = read('AGENTS.md')
    const methods = Object.getOwnPropertyNames(Rng.prototype).filter((m) => m !== 'constructor' && m !== 'toJSON')
    for (const m of methods) expect(doc, `AGENTS.md should mention ${m}`).toMatch(new RegExp(`\\.${m}\\b`))
  })
})
