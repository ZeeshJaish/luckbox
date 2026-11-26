# Using luckbox (for AI coding agents)

You are reading this because `luckbox` is installed in this project. It is a zero-dependency library for **seeded, replayable randomness in games**. Use it for all gameplay randomness. Don't use `Math.random()`: it can't be seeded, saved or replayed.

## Rules

1. **Make one root generator per game or run**, from a seed: `const rng = luck(seed)`. Use `luck()` with no seed for a fresh run, then store `rng.seed` so the run can be replayed or shared.
2. **Give each system its own stream** with `rng.fork('name')` (terrain, loot, enemies, weather…). A fork depends only on the seed and the name, so adding random calls in one system never changes another.
3. **Save and load** with `rng.state()` and `luck.from(state)`. Bags, decks, loot pity, gacha banners and `fairChance` also have `.state()`, restored with `{ state }`.
4. **Use the built-in helper, not hand-written maths:** `rng.int(1, 6)`, not `Math.floor(rng.float() * 6) + 1`; `rng.pick(list)`; `rng.shuffle(list)`; `rng.weighted({...})`; `rng.roll('2d6+3')`.
5. **Daily or weekly content that is the same for every player:** `luck.daily({ salt: 'game-name' })`.
6. **Don't use luckbox for secrets** (passwords, tokens, real-money gambling). It is predictable by design. Use `crypto.getRandomValues()` for those.

## Imports

```javascript
import { luck } from 'luckbox'                    // everything except the three add-ons
import { createNoise } from 'luckbox/noise'       // simplex noise for terrain and maps
import { names } from 'luckbox/names'             // names: 'fantasy', 'place', 'planet', 'tavern' or learned from your examples
import { seedrandom } from 'luckbox/seedrandom'   // drop-in replacement for the seedrandom package
```

Script tag (single HTML file): `<script src="https://cdn.jsdelivr.net/npm/luckbox@1"></script>`, then `luckbox.luck(...)`, `luckbox.createNoise(...)`, `luckbox.names(...)`, `luckbox.seedrandom(...)`.

## API

```javascript
const rng = luck('seed')               // seeds: text, number, bigint or a list like [worldSeed, x, y]; 42 === '42'
rng.float()                            // [0, 1)
rng.int(min, max)                      // whole number, both ends included, no bias
rng.range(min, max)                    // decimal in [min, max)
rng.chance(0.25)                       // true 25% of the time
rng.bool() / rng.sign()                // coin flip / 1 or -1
rng.pick(list) / rng.sample(list, n)   // one item / n different items
rng.shuffle(list)                      // new shuffled array; rng.shuffleInPlace(array) shuffles the array itself
rng.weighted({ a: 70, b: 30 })         // also [[item, weight]] pairs or (items, item => weight)
rng.roll('4d6kh3')                     // dice total: kh/kl keep, dh/dl drop, ! explode, r1 / ro1 reroll, dF, d%, *10
rng.dice('2d6+3')                      // { total, groups: [{ dice: [{ value, kept, rolls, rerolled }] }], text }
luck.odds('2d6')                       // { chance(t), atLeast(t), atMost(t), mean, min, max, totals }
rng.loot({ common: 80, rare: 18, epic: 2 }, { pity: { epic: 40 }, softPity: { epic: { after: 30, add: 0.05 } } })
  // .open() → 'rare', .openMany(n), .odds(), .rates() (long-run, pity included), .simulate(n), .state()
rng.loot({ rolls: [1, 3], unique: true, always: ['xp'], drops: {
  nothing: 30, gold: { weight: 50, amount: [10, 50] }, gem: { weight: 20, when: (ctx) => ctx.level > 5 },
  bonus: { weight: 5, table: { potion: 1, scroll: 1 } } } })
  // .open(ctx) → [{ item: 'gold', amount: 23 }, ...]
rng.gacha({ rates: { star5: 6, star4: 51, star3: 943 }, pity: { star5: 90, star4: 10 }, softPity: { star5: { after: 73, add: 0.06 } },
  pools: { star5: { featured: ['Nova'], standard: ['Ash', 'Bryn'] } },  // 50/50 (featuredChance), lose it and the next star5 is featured
  spark: { cost: 300 } })                                               // a rarity with no pool gives its own name as the item
  // .pull() → { rarity, item, featured, pity }, .pullMany(n), .redeem(item) (spark), .sparks, .isGuaranteed(rarity)
  // .itemRates() (real rate per item), .disclosure() ({ rarities, items, rules }: odds text for players), .simulate(n), .state()
rng.bag(items, { noRepeat: true })     // .next(), .peek(): each item once per round (Tetris-style 7-bag)
rng.deck(cards)                        // .draw(), .drawMany(n), .discard(card), .putBack(card, 'top'|'bottom'|'random'), .reshuffle()
rng.fairChance(0.25)                   // .roll(): same average, no long unlucky streaks (crits)
rng.normal(mean, sd) / rng.exponential(rate) / rng.poisson(mean) / rng.triangular(min, max, mode)
rng.angle() / rng.pointInCircle(r) / rng.pointOnCircle(r) / rng.pointInRect(w, h)
rng.scatter(width, height, spacing)    // Poisson-disk points [{ x, y }], never closer than spacing
rng.id(length?, alphabet?) / rng.uuid()
rng.fork(name) / rng.clone() / rng.state() / rng.hash() / rng.seed / rng.draws / rng.algorithm / rng.uint32()
luck.from(state) / luck.daily(opts) / luck.weekly(opts) / luck.dayKey() / luck.weekKey()
luck.weights(spec) // reusable alias-method table: .pick(rng), .odds()
luck.patchMathRandom(seed) // { rng, restore() }: makes Math.random seeded (tests)
createNoise(seedOrRng)     // .noise2d(x, y), .noise3d(x, y, z), .fbm2d(x, y, { octaves }), .fbm3d(...), all −1 to 1
names('fantasy')           // .next(rng) → 'Rhillon', .many(rng, n): n different names
names(['Aarav', 'Diya', 'Kavya', 'Rohan'], { min, max, order, allowExamples }) // learns your examples, never copies them
```

Errors are `LuckboxError` with `.code`: `BAD_SEED`, `BAD_ARGUMENT`, `EMPTY_LIST`, `BAD_STATE`, `BAD_DICE`, `BAD_DATE`, `BAD_TIMEZONE`, `BAD_ALGORITHM`. The messages say how to fix the problem.

## Patterns

```javascript
// Run seed from the URL, so players can share runs
const seed = new URLSearchParams(location.search).get('seed') ?? undefined
const rng = luck(seed)            // with no seed in the URL, rng.seed holds a fresh one to show players

// Procedural chunks that never depend on visit order
const chunk = luck([worldSeed, cx, cy])

// Enemy drop
const drops = rng.fork('loot').loot({ drops: { gold: { weight: 1, amount: '2d6*5' } } })
for (const { item, amount } of drops.open()) inventory.add(item, amount)

// Gacha save: the banner's state holds pity, the 50/50 guarantee and sparks
const save = { rng: rng.state(), banner: banner.state() }
const banner2 = luck.from(save.rng).gacha(BANNER, { state: save.banner })

// Names: make one stream for names once, then draw from it
const nameRng = rng.fork('names')
const town = names('place').next(nameRng)
```

## Don't

- Don't create a new `luck(seed)` (or `rng.fork(name)`) every frame or every call with the same seed or name. It gives the same numbers every time. Keep one generator and draw from it.
- Don't call `Math.random()` alongside luckbox for gameplay. The results can't be replayed.
- Don't hand-roll the 50/50 or spark on top of `rng.loot()`. Use `rng.gacha()`, which saves the guarantee and reports real per-item rates.
- Don't compare `luck(seed)` results with `seedrandom(seed)`. They are different generators. `luckbox/seedrandom` is only for reproducing old seedrandom results.
