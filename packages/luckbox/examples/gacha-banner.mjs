// A gacha banner with pity, the drop rates players are shown, and saving.
import { luck } from 'luckbox'

const rates = { star5: 6, star4: 51, star3: 943 } // 0.6% · 5.1% · 94.3%
const pity = { pity: { star5: 90, star4: 10 }, softPity: { star5: { after: 73, add: 0.06 } } }

const player = luck('player-42')
const banner = player.loot(rates, pity)

// Odds disclosure: the base chance and the real rate once pity is counted.
const real = banner.rates()
console.log('Drop rates (base → with pity)')
for (const [item, chance] of Object.entries(banner.odds())) {
  console.log(`  ${item}: ${(chance * 100).toFixed(2)}% → ${(real[item] * 100).toFixed(2)}%`)
}

// A 10-pull.
console.log(`\n10-pull: ${banner.openMany(10).join(', ')}`)
console.log(`Pity so far: ${JSON.stringify(banner.state().misses)}`)

// Save, then load later and keep pulling exactly where you were.
const save = JSON.stringify({ rng: player.state(), pity: banner.state() })
const loaded = JSON.parse(save)
const again = luck.from(loaded.rng).loot(rates, { ...pity, state: loaded.pity })
console.log(`After loading, next pull: ${again.open()} (the same as without saving: ${banner.open()})`)

// Balance check: how long can players go without a 5-star?
const sim = banner.simulate(200_000).drops.star5
console.log(`\nIn 200,000 simulated pulls: ${sim.count} five-stars, longest wait ${sim.longestWait} pulls`)
