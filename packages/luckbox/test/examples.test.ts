// Every example in examples/ must run and print what it promises.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = fileURLToPath(new URL('../examples/', import.meta.url))
const EXPECT: Record<string, string[]> = {
  'daily-puzzle.mjs': ['Puzzle #27 (2026-11-27)', 'my-word-game:daily:2026-11-27'],
  'gacha-banner.mjs': ['star5: 0.60% → 1.58%', '10-pull:', 'After loading, next pull'],
  'roguelike-dungeon.mjs': ['@', 'rooms · chest in room 2'],
  'card-game.mjs': ['Turn 1: drew', 'After loading, turn 4 draws'],
  'fair-crits.mjs': ['fairChance(0.25):', 'never more than'],
  'world-map.mjs': ['~ water', 'T tree'],
}

describe('examples', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'))
  it('every example has expectations', () => {
    expect(files.sort()).toEqual(Object.keys(EXPECT).sort())
  })
  it.each(files)('%s runs', (file) => {
    const r = spawnSync(process.execPath, [file], { cwd: dir, encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    for (const text of EXPECT[file] ?? []) expect(r.stdout).toContain(text)
  })
  it('saved games continue exactly', () => {
    const cards = spawnSync(process.execPath, ['card-game.mjs'], { cwd: dir, encoding: 'utf8' }).stdout
    const after = /After loading, turn 4 draws: (.*)/.exec(cards)?.[1]
    const without = /Without saving, turn 4 draws: (.*)/.exec(cards)?.[1]
    expect(after).toBe(without)
  })
})
