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

  // Phase 2 (locked 2026-11-26)
  const d = luck('locked-dice')
  const notations = ['2d6', 'd20+5', '4d6kh3', '2d20kl1', '4d6dl1', '3d6!', '2d6r1', '2d6ro<2', 'd%', '4dF', '5d4*10', '1d8+1d6-2']
  out.dice = {
    rolls: notations.map((n) => [n, d.roll(n), d.roll(n), d.roll(n)]),
    detail: d.dice('4d6kh3+2').text,
    exploding: Array.from({ length: 20 }, () => d.roll('2d6!')),
    many: sha256(Array.from({ length: 20_000 }, () => d.roll('3d6!kh2+1d4-2'))),
  }
  // Odds use Math.log/exp, so lock them to 12 decimals (the last bits may differ between engines).
  const round = (x: number): number => Math.round(x * 1e12) / 1e12
  out.odds = ['4d6kh3', '3d6!kh2+1d4-2', '2d10ro<3*2+5'].map((n) => {
    const o = luck.odds(n)
    return [n, o.min, o.max, round(o.mean), o.totals.slice(0, 6).map((t) => [t.total, round(t.chance)])]
  })
  const w = luck('locked-weighted')
  out.weighted = {
    names: Array.from({ length: 12 }, () => w.weighted({ gold: 70, gem: 25, crown: 5 })),
    decimal: Array.from({ length: 6 }, () => w.weighted({ a: 0.1, b: 0.2, c: 0.7 })),
    pairs: Array.from({ length: 6 }, () => w.weighted([[1, 3], [2, 1]] as const)),
    table: Array.from({ length: 6 }, () => luck.weights({ x: 1, y: 2, z: 3 }).pick(w)),
  }
  const b = luck('locked-bag')
  const bag = b.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'], { noRepeat: true })
  out.bag = Array.from({ length: 21 }, () => bag.next()).join('')
  const deck = b.deck(['A', 'K', 'Q', 'J', '10', '9', '8'])
  const hand = deck.drawMany(4)
  deck.discard(...hand.slice(0, 2))
  out.deck = { hand, next: deck.drawMany(6), state: deck.state() }
  out.loot = luck('locked-loot').loot({ common: 80, rare: 18, epic: 2 }).openMany(30).join(',')
  return out
}
