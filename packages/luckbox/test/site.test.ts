// The docs site: every page has search metadata, every internal link works,
// and every recipe's code at least parses.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { RECIPES } from '../site/content.mjs'

const siteDir = fileURLToPath(new URL('../site/', import.meta.url))
const out = join(siteDir, 'out')
const pages: string[] = []

beforeAll(() => {
  execFileSync(process.execPath, [join(siteDir, 'build.mjs')], { env: { ...process.env, SITE_URL: 'https://example.test/luckbox/' } })
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith('.html')) pages.push(p)
    }
  }
  walk(out)
})

describe('site', () => {
  it('builds every page', () => {
    expect(pages.length).toBe(9)
    for (const f of ['llms.txt', 'llms-full.txt', 'sitemap.xml', 'robots.txt', 'og.png', 'style.css']) expect(existsSync(join(out, f)), f).toBe(true)
  })

  it('every page has a title, description, canonical link and valid JSON-LD', () => {
    for (const page of pages.filter((p) => !p.includes('playground'))) {
      const html = readFileSync(page, 'utf8')
      expect(html, page).toMatch(/<title>[^<]{10,}<\/title>/)
      expect(html, page).toMatch(/<meta name="description" content="[^"]{50,}">/)
      expect(html, page).toMatch(/<link rel="canonical" href="https:\/\/example\.test\/luckbox\//)
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) expect(() => JSON.parse(m[1] as string)).not.toThrow()
    }
  })

  it('every internal link points at a real file', () => {
    for (const page of pages) {
      const html = readFileSync(page, 'utf8')
      for (const m of html.matchAll(/(?:href|src)="([^"#:]+?)(?:#[^"]*)?"/g)) {
        const target = m[1] as string
        if (target.startsWith('//') || target.startsWith('data')) continue
        expect(existsSync(resolve(dirname(page), target)), `${page} → ${target}`).toBe(true)
      }
    }
  })

  it('the sitemap lists every page under SITE_URL', () => {
    const sitemap = readFileSync(join(out, 'sitemap.xml'), 'utf8')
    expect(sitemap.match(/<loc>/g)?.length).toBe(9)
    expect(sitemap).toContain('https://example.test/luckbox/recipes/phaser.html')
  })

  it.each(RECIPES.map((r) => [r.slug, r] as const))('recipe %s: the code parses', (_slug, recipe) => {
    const dir = mkdtempSync(join(tmpdir(), 'luckbox-recipe-'))
    const code = recipe.lang === 'html' ? (/<script>([\s\S]*?)<\/script>/.exec(recipe.code)?.[1] ?? '') : recipe.code
    const file = join(dir, recipe.lang === 'html' ? 'page.js' : 'main.mjs')
    writeFileSync(file, code)
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })

  it('recipes only call luckbox APIs that exist', async () => {
    const { luck } = await import('../src/index.ts')
    const rng = luck('x') as unknown as Record<string, unknown>
    for (const r of RECIPES) {
      for (const m of r.code.matchAll(/\b(?:rng|world|sky|dice|spawns|damage|today|chest|this\.rng)\.([a-zA-Z]+)\(/g)) {
        const name = m[1] as string
        if (['open', 'state'].includes(name)) continue // chest methods
        expect(name in rng, `${r.slug}: ${m[0]}`).toBe(true)
      }
    }
  })
})
