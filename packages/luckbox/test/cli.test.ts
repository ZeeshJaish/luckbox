// The `npx luckbox` command, run as a real process against the build.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { VERSION, luck } from '../src/index.ts'
import * as namesModule from '../src/names.ts'

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))
const run = (...args: string[]): { out: string; err: string; code: number } => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status ?? -1 }
}

describe('npx luckbox', () => {
  it('rolls dice, the same as the library for the same seed', () => {
    const { out, code } = run('roll', '4d6kh3', '--times', '6', '--seed', 'hero')
    expect(code).toBe(0)
    const rng = luck('hero')
    const want = Array.from({ length: 6 }, () => rng.roll('4d6kh3')).join('  ')
    expect(out.split('\n')[0]).toBe(want)
    expect(out).toContain('seed hero')
  })

  it('shows every die for a single roll, and a replay seed when none is given', () => {
    expect(run('roll', '2d20kh1+5', '--seed', 'x').out).toBe(`${luck('x').dice('2d20kh1+5').text}\nseed x`)
    const fresh = run('roll', '1d6').out
    expect(fresh).toMatch(/replay with --seed [0-9a-z]{10}$/)
  })

  it('prints exact odds as a table', () => {
    const { out } = run('odds', '2d6')
    expect(out).toContain('min 2 · max 12 · average 7')
    expect(out).toMatch(/7\s+16\.67%\s+58\.33%\s+█+/)
    expect(out).toMatch(/2\s+2\.78%\s+100%/)
  })

  it('picks and shuffles', () => {
    expect(run('pick', 'sword', 'bow', 'staff', '--seed', 'a').out.split('\n')[0]).toBe(luck('a').pick(['sword', 'bow', 'staff']))
    expect(run('shuffle', 'A', 'K', 'Q', '--seed', 'a').out.split('\n')[0]).toBe(luck('a').shuffle(['A', 'K', 'Q']).join(' '))
  })

  it('opens loot tables and shows real rates with pity', () => {
    const simple = run('loot', '{"common":80,"rare":18,"epic":2}', '--open', '3', '--seed', 'chest').out
    expect(simple).toMatch(/common\s+80\.00%/)
    const drops = luck('chest').loot({ common: 80, rare: 18, epic: 2 }).openMany(3)
    drops.forEach((d, i) => expect(simple).toContain(`${i + 1}  ${d}`))
    const banner = run(
      'loot',
      '{"table":{"star5":6,"star4":51,"star3":943},"options":{"pity":{"star5":90,"star4":10}}}',
      '--simulate',
      '20000',
      '--seed',
      'g',
    ).out
    expect(banner).toContain('real rate with pity')
    expect(banner).toContain('simulated 20,000 opens')
    const full = run('loot', '{"rolls":2,"drops":{"gold":{"weight":1,"amount":[10,10]}}}', '--open', '1', '--seed', 'b').out
    expect(full).toContain('gold ×10, gold ×10')
  })

  it('reads a loot table from a file', () => {
    const file = fileURLToPath(new URL('./fixtures/banner.json', import.meta.url))
    const { out, code } = run('loot', file, '--rates')
    expect(code).toBe(0)
    expect(out).toContain('star5')
  })

  it('pulls a gacha banner with pity, the 50/50 and spark', () => {
    const file = fileURLToPath(new URL('./fixtures/gacha.json', import.meta.url))
    const spec = JSON.parse(readFileSync(file, 'utf8'))
    const { out, code } = run('gacha', file, '--pull', '10', '--seed', 'demo')
    expect(code).toBe(0)
    const pulls = luck('demo').gacha(spec).pullMany(10)
    const lines = out.split('\n')
    pulls.forEach((p, i) => expect(lines[i]?.split(/\s{2,}/)).toEqual([p.rarity, `${p.item}${p.featured ? ' ★' : ''}`, `pity ${p.pity}`]))
    expect(out).toContain('10 sparks')
    const disclosure = run('gacha', file, '--disclosure').out
    expect(disclosure).toContain('Odds disclosure')
    expect(disclosure).not.toContain('seed') // no randomness used, so no seed to replay
    expect(disclosure).toContain('If it isn\'t, the next star5 is guaranteed featured.')
    expect(disclosure).toMatch(/Nova\s+star5\s+yes\s+1\.05%/)
    const sim = run('gacha', file, '--simulate', '20000', '--seed', 's').out
    expect(sim).toContain('simulated 20,000 pulls')
    expect(sim).toContain('featured share')
    expect(run('gacha', file, '--pull', '200', '--seed', 'w').out).toContain('200 pulls, showing only star5')
  })

  it('makes names in a style, from examples, or from a file', () => {
    const { names } = namesModule
    expect(run('names', 'tavern', '--count', '3', '--seed', 'd').out.split('\n').slice(0, 3)).toEqual(names('tavern').many(luck('d'), 3))
    expect(run('names', '--count', '2', '--seed', 'd').out.split('\n').slice(0, 2)).toEqual(names('fantasy').many(luck('d'), 2))
    const fromList = run('names', 'Haruto,Yuto,Sota,Yuki,Hinata,Riku,Kaito,Ren', '--count', '3', '--seed', 'd').out
    expect(fromList.split('\n')).toHaveLength(4)
    const file = fileURLToPath(new URL('./fixtures/names.txt', import.meta.url))
    expect(run('names', file, '--count', '2', '--seed', 'd').code).toBe(0)
    expect(run('names', 'elvish').code).toBe(2)
  })

  it('shows daily and weekly seeds', () => {
    const { out } = run('daily', '--salt', 'my-game', '--date', '2026-11-27')
    expect(out).toContain('my-game:daily:2026-11-27')
    expect(out).toContain('2026-W48')
  })

  it('makes fresh seeds, shows help and version', () => {
    expect(run('seed').out).toMatch(/^[0-9a-z]{10}$/)
    expect(run('--version').out).toBe(VERSION)
    expect(run('--help').out).toContain('Usage')
    expect(run('help').code).toBe(0)
    expect(run().code).toBe(2)
  })

  it('explains mistakes with an exit code', () => {
    const bad = run('roll', '4d6kh5')
    expect(bad.code).toBe(1)
    expect(bad.err).toContain("can't keep 5 of 4 dice")
    for (const args of [['dance'], ['roll'], ['odds'], ['pick'], ['loot'], ['loot', 'nope.json'], ['loot', '{bad'], ['roll', '1d6', '--times', '0'], ['roll', '1d6', '--seed'], ['gacha'], ['gacha', 'nope.json'], ['gacha', '{bad']]) {
      const r = run(...args)
      expect(r.code, args.join(' ')).toBe(2)
      expect(r.err).toContain('luckbox:')
    }
  })
})
