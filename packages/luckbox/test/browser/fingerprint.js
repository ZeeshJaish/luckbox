// Same calls in any environment; returns a JSON-able fingerprint.
// `lb` is the luckbox namespace: { luck, createNoise, seedrandom }.
function fingerprint(lb) {
  const luck = lb.luck
  const rng = luck('cross-platform')
  const out = {}
  out.uint32 = Array.from({ length: 5 }, () => rng.uint32())
  out.float = [rng.float(), rng.float()]
  out.int = Array.from({ length: 10 }, () => rng.int(1, 6))
  out.big = rng.int(0, 2 ** 52)
  out.shuffle = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8])
  out.uuid = rng.uuid()
  out.id = rng.id()
  out.dice = rng.dice('4d6kh3+2').text
  out.explode = Array.from({ length: 5 }, () => rng.roll('3d6!'))
  out.weighted = Array.from({ length: 6 }, () => rng.weighted({ gold: 70, gem: 25, crown: 5 }))
  const bag = rng.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'], { noRepeat: true })
  out.bag = Array.from({ length: 14 }, () => bag.next()).join('')
  out.fork = luck('cross-platform').fork('enemies').fork(3).uint32()
  out.unicode = luck('🎲 मुंबई').uint32()
  out.daily = luck.daily({ date: '2026-11-26', salt: 'g' }).uint32()
  out.tz = luck.dayKey({ date: new Date('2026-11-26T20:00:00Z'), timeZone: 'Asia/Kolkata' })
  out.odds = luck.odds('4d6kh3').mean
  for (const algorithm of ['xoshiro128**', 'mulberry32']) out[algorithm] = luck('x', { algorithm }).uint32()
  // Phase 3: these use luckbox's own ln/exp, so they must match to the last bit.
  const s = luck('cross-platform-3')
  out.normal = Array.from({ length: 20 }, () => s.normal(100, 15))
  out.exponential = Array.from({ length: 10 }, () => s.exponential(0.25))
  out.poisson = [s.poisson(3), s.poisson(42.5), s.poisson(1e6)]
  out.triangular = [s.triangular(1, 10, 3), s.triangular(-5, 5)]
  out.circle = [s.pointInCircle(5), s.pointOnCircle(2)]
  const trees = s.scatter(300, 200, 20)
  out.scatter = [trees.length, trees[trees.length - 1]]
  const crit = s.fairChance(0.3)
  out.fair = Array.from({ length: 30 }, () => (crit.roll() ? 1 : 0)).join('')
  const banner = s.loot({ star5: 6, star4: 51, star3: 943 }, { pity: { star5: 90, star4: 10 }, softPity: { star5: { after: 73, add: 0.06 } } })
  out.pity = banner.openMany(200).join('').length + ':' + JSON.stringify(banner.state())
  out.rates = banner.rates()
  out.chest = s.loot({ rolls: [1, 3], drops: { nothing: 2, gold: { weight: 5, amount: '2d6*10' }, gem: 1 } }).openMany(5)
  out.hash = s.hash()
  const noise = lb.createNoise('cross-platform')
  out.noise = [noise.noise2d(1.5, -2.25), noise.noise3d(0.3, 0.6, 0.9), noise.fbm2d(10.1, 20.2, { octaves: 6 })]
  const sr = lb.seedrandom('hello.')
  out.seedrandom = [sr(), sr.int32(), sr.quick()]
  return out
}
