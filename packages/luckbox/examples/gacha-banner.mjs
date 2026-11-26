// A gacha banner: a featured character with the 50/50, pity, spark,
// the odds players are shown, saving, and a balance check.
import { luck } from 'luckbox'

const BANNER = {
  rates: { star5: 6, star4: 51, star3: 943 }, // 0.6% · 5.1% · 94.3%
  pity: { star5: 90, star4: 10 },
  softPity: { star5: { after: 73, add: 0.06 } },
  pools: {
    star5: { featured: ['Nova'], standard: ['Ash', 'Bryn', 'Cato'] }, // lose the 50/50 and the next 5★ is Nova
    star4: { featured: ['Fen', 'Gale'], standard: ['Iris', 'Jax', 'Kai'] },
    star3: { standard: ['Sword', 'Bow', 'Staff', 'Shield'] },
  },
  spark: { cost: 300 }, // every pull earns a point; 300 buy a featured item
}
const pct = (p) => `${(p * 100).toFixed(2)}%`

const player = luck('player-42')
const banner = player.gacha(BANNER)

// Odds disclosure: the base chance and the real rate once pity is counted.
const disclosure = banner.disclosure()
console.log('Drop rates (base → with pity)')
for (const r of disclosure.rarities) console.log(`  ${r.rarity}: ${pct(r.baseRate)} → ${pct(r.rate)}`)
const nova = disclosure.items.find((i) => i.item === 'Nova')
console.log(`  Nova, featured: ${pct(nova.rate)} per pull (the 50/50 and its guarantee included)`)

// A 10-pull.
const ten = banner.pullMany(10)
console.log(`\n10-pull: ${ten.map((p) => (p.featured ? `${p.item} ★` : p.item)).join(', ')}`)

// Keep pulling until the first 5★.
for (;;) {
  const p = banner.pull()
  if (p.rarity !== 'star5') continue
  const result = p.featured ? 'won the 50/50' : 'lost the 50/50, so the next 5★ is guaranteed to be Nova'
  console.log(`First 5★ on pull ${banner.totalPulls}: ${p.item} (${result})`)
  break
}
console.log(`Sparks: ${banner.sparks} of ${BANNER.spark.cost}`)

// Save, then load later and keep pulling exactly where you were.
const save = JSON.stringify({ rng: player.state(), banner: banner.state() })
const loaded = JSON.parse(save)
const again = luck.from(loaded.rng).gacha(BANNER, { state: loaded.banner })
console.log(`After loading, next pull: ${again.pull().item} (the same as without saving: ${banner.pull().item})`)

// Balance check: how long can players wait, and how often is a 5★ the featured one?
const sim = banner.simulate(200_000)
const five = sim.rarities.star5
console.log(`\nIn 200,000 simulated pulls: ${five.count} five-stars, longest wait ${five.longestWait} pulls, ${pct(sim.featuredShare.star5)} of them Nova`)
