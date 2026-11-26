// Same calls in any environment; prints a JSON fingerprint.
function fingerprint(luck) {
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
  out.odds = Math.round(luck.odds('4d6kh3').mean * 1e12) / 1e12
  for (const algorithm of ['xoshiro128**', 'mulberry32']) out[algorithm] = luck('x', { algorithm }).uint32()
  return out
}

