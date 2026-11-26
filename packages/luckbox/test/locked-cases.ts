// The exact results luckbox promises never to change.
// test/locked.json holds the expected values; locked.test.ts checks them.
import { createHash } from 'node:crypto'
import { ALGORITHMS, type Seed, luck } from '../src/index.ts'

const SEEDS: Array<[string, Seed]> = [
  ['text', 'luckbox'],
  ['number', 42],
  ['empty', ''],
  ['unicode', '🎲 मुंबई'],
  ['list', ['world', 3, -7]],
  ['bigint', 2n ** 64n],
]

const sha256 = (values: readonly unknown[]): string =>
  createHash('sha256').update(values.join(',')).digest('hex')

export function lockedValues(): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const algorithm of ALGORITHMS) {
    for (const [name, seed] of SEEDS) {
      const rng = luck(seed, { algorithm })
      const outputs = Array.from({ length: 1000 }, () => rng.uint32())
      out[`${algorithm}/${name}`] = { first: outputs.slice(0, 8), sha256: sha256(outputs) }
    }
  }

  const r = luck('locked')
  out.methods = {
    float: [r.float(), r.float(), r.float()],
    int: Array.from({ length: 10 }, () => r.int(1, 6)),
    bigInt: [r.int(0, 2 ** 40), r.int(-(2 ** 52), 2 ** 52)],
    range: [r.range(0, 360), r.range(-1, 1)],
    chance: Array.from({ length: 8 }, () => r.chance(0.3)),
    bool: Array.from({ length: 8 }, () => r.bool()),
    sign: Array.from({ length: 4 }, () => r.sign()),
    pick: r.pick(['sword', 'bow', 'staff', 'wand']),
    sample: r.sample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3),
    shuffle: r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    id: r.id(),
    uuid: r.uuid(),
    draws: r.draws,
  }

  const world = luck('locked')
  out.forks = {
    enemies: Array.from({ length: 3 }, () => world.fork('enemies').uint32()),
    nested: [world.fork('level').fork(3).uint32(), world.fork('level').fork(4).uint32()],
  }

  const fresh = luck('stream')
  out.many = sha256(Array.from({ length: 100_000 }, () => fresh.int(0, 999)))
  out.daily = [luck.daily({ date: '2026-11-26' }).uint32(), luck.weekly({ date: '2026-11-26', salt: 'g' }).uint32()]
  return out
}
