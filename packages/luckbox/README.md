# luckbox

**Randomness for games that you can replay.** The same seed gives the same results on every device, in every version. Dice, loot tables with gacha-style pity, weighted picks, shuffle bags, card decks, bell curves, scattered points, map noise and daily challenges are all built in.

```js
import { luck } from 'luckbox'

const rng = luck('my-seed')                    // same seed → same results, everywhere
rng.int(1, 6)                                  // 2
rng.pick(['sword', 'bow', 'staff'])            // 'staff'
rng.roll('4d6kh3')                             // 13: roll 4 dice, keep the highest 3
rng.weighted({ gold: 70, gem: 25, crown: 5 })  // 'gold'
Math.round(rng.normal(100, 15))                // 100: a bell curve

const saved = rng.state()                      // save it, load it later, continue exactly
```

- **Replayable.** A seed gives the same results everywhere, because luckbox does its own maths instead of relying on each browser's `Math.log`. Every release is checked against locked results, so your seeds never change.
- **Made for games.** Dice notation with exact odds, loot tables with hard and soft pity, real drop rates for gacha odds disclosure, balancing simulations, shuffle bags, decks, streak-free crits, Poisson-disk scattering and simplex noise.
- **Fair.** No modulo bias, full 53-bit decimals, and generators checked bit for bit against their C reference code.
- **Small.** About 14 KB minified + brotli with no dependencies. Noise and seedrandom compatibility are separate imports, so you only download what you use.
- **Friendly.** Full TypeScript types, an example on every method, and errors that tell you how to fix the problem.

## Install

```bash
npm install luckbox
```

Single-file HTML game? Use one script tag. Everything, add-ons included, is on `window.luckbox`:

```html
<script src="https://cdn.jsdelivr.net/npm/luckbox@0.2"></script>
<script>
  const rng = luckbox.luck('my-seed')
  console.log(rng.roll('2d6'))
</script>
```

Or import it straight from a CDN:

```javascript
import { luck } from 'https://cdn.jsdelivr.net/npm/luckbox@0.2/+esm'
```

## How do I…

### …make a daily level that's the same for every player?

```js
const today = luck.daily({ salt: 'my-game', date: '2026-11-26' })
today.seed                                     // 'my-game:daily:2026-11-26'
```

Leave out `date` to get today. By default the day changes at midnight UTC, so the whole world shares one daily. For a local calendar and a morning reset, pass `timeZone: 'Asia/Kolkata', resetHour: 4`. `luck.weekly()` works the same way with ISO weeks. To replay any past day, use its seed: `luck('my-game:daily:2026-11-25')`.

### …let players replay or share a run?

```javascript
const run = luck()            // picks a fresh seed
showOnScreen(run.seed)        // e.g. 'k3f9x2pqm7': readable, no look-alike letters
const replay = luck('k3f9x2pqm7')   // anyone with the code gets the same run
```

### …save the game and continue exactly where it left off?

```javascript
save.rng = rng.state()            // plain JSON (or JSON.stringify(rng))
const rng = luck.from(save.rng)   // the next numbers are exactly the ones you would have got
```

Bags, decks, loot pity and fair chances save the same way: `thing.state()`, restored with `{ state }`.

### …stop new code from changing my world generation?

Give each system its own stream with `fork()`. A fork depends only on the seed and its name, never on how many numbers were drawn before, so an extra random call in your weather code can't change your dungeon.

```javascript
const world = luck(seed)
const terrain = world.fork('terrain')
const loot = world.fork('loot')
const chunk = world.fork('chunk').fork(`${x},${y}`)   // forks can be nested
```

### …roll dice?

```js
const rng = luck('dice-demo')
rng.roll('2d6+3')               // 7
rng.roll('2d20kh1')             // 14: advantage, the better of two d20s
rng.dice('4d6kh3+2').text       // '4d6kh3 (4, 5, 4 dropped, 6) + 2 = 17'
```

| Notation | Meaning |
|---|---|
| `2d6`, `d20`, `d%` | Two six-sided dice, one d20, one d100 |
| `d20+5`, `1d8+1d6-2` | Add or subtract dice and numbers |
| `4d6kh3` or `4d6k3` | Roll 4, keep the highest 3 |
| `2d20kl1` | Roll 2, keep the lowest 1 (disadvantage) |
| `4d6dl1`, `4d6dh1` | Drop the lowest / highest 1 |
| `3d6!` | Exploding: a max roll adds another roll to that die |
| `2d6r1`, `2d6r<2` | Reroll 1s (or 1s and 2s) until they stop |
| `2d6ro1` | Reroll 1s once |
| `4dF` | Fudge dice: −1, 0 or +1 each |
| `5d4*10` or `5d4x10` | Multiply by a whole number |

### …show the real odds of a roll?

Odds are worked out exactly, with maths, not by rolling:

```js
const odds = luck.odds('2d6')
odds.chance(7)       // 0.16666666666666669 (6 in 36)
odds.atLeast(10)     // 0.16666666666666666
odds.mean            // 7
odds.min             // 2
```

### …make a loot table?

```js
const chest = luck('chest-demo').loot({ common: 80, rare: 18, epic: 2 })
chest.open()         // 'rare'
chest.odds().epic    // 0.02
```

With whole-number weights, drops are exact: weight 2 out of 100 drops exactly 2% of the time, with no rounding.

### …add pity, like gacha games?

```js
const banner = luck('gacha').loot(
  { star5: 6, star4: 51, star3: 943 },                     // 0.6%, 5.1%, 94.3%
  {
    pity: { star5: 90, star4: 10 },                        // guaranteed by the 90th / 10th pull
    softPity: { star5: { after: 73, add: 0.06 } },         // +6 points per pull from pull 74
  },
)
banner.open()        // 'star3'
banner.odds()        // the chances for the next pull, pity included
banner.rates()       // the real long-run rates: star5 ≈ 1.58%, not 0.6%
```

`rates()` works out the long-run rates exactly, pity included. Those are the numbers many countries require games to show players. `banner.state()` saves the pity counters.

### …drop gold amounts, several items, or items only for high-level players?

Give the table a `drops` object, and each open returns a list:

```js
const boss = luck('boss').loot({
  rolls: 2,                                         // or [1, 3] for 1 to 3 picks
  drops: {
    gold: { weight: 70, amount: [10, 50] },         // amount: a number, [min, max] or dice like '2d6*10'
    sword: 30,
  },
})
boss.open().length                                  // 2
```

More options: `nothing: 40` (a drop that gives nothing), `unique: true` (no repeats in one open), `always: ['xp']` (added to every open), `when: (player) => player.level >= 10` (conditional drops, using the context from `open(player)`) and `table: { ... }` (a table inside a table). Pity works here too.

### …balance my drop rates?

```js
const chest = luck('chest-demo').loot({ common: 80, rare: 18, epic: 2 }, { pity: { epic: 60 } })
const epic = chest.simulate(100_000).drops.epic
epic.count           // 2858
epic.longestWait     // 59: pity 60 means at most 59 opens without an epic
chest.rates().epic   // 0.028471904731198476
```

`simulate()` runs on its own fork, so it never changes your game's results.

### …pick by weight?

```javascript
rng.weighted({ slime: 10, bat: 5, dragon: 1 })
rng.weighted([[swordObject, 3], [shieldObject, 1]])
rng.weighted(enemies, (e) => e.spawnWeight)

const spawns = luck.weights(enemies, (e) => e.spawnWeight)   // build once (alias method)…
spawns.pick(rng)                                             // …then every pick takes the same time
```

### …avoid unlucky streaks?

```javascript
const crit = rng.fairChance(0.25)       // 25% on average…
crit.roll()                             // …but never 13 misses in a row (plain 25% can miss 40+)

const pieces = rng.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'], { noRepeat: true })
pieces.next()                           // every piece once before any repeats (Tetris-style 7-bag)
```

### …make a deck of cards?

```javascript
const deck = rng.deck(cards)
const hand = deck.drawMany(5)
deck.discard(hand[0])
deck.putBack(hand[1], 'bottom')
deck.reshuffle()     // the discard pile goes back in, everything is shuffled
```

### …get natural-looking numbers?

```javascript
rng.normal(100, 15)          // bell curve: stats, damage spread, heights
rng.triangular(1, 10, 3)     // 1 to 10, usually around 3
rng.exponential(1 / 30)      // time until the next random event (30 on average)
rng.poisson(3)               // how many events in a period (3 on average)
```

### …place trees and rocks without overlaps?

```javascript
const trees = rng.scatter(2000, 2000, 40)   // natural spread, never closer than 40 (Poisson-disk)
rng.pointInCircle(50)                       // { x, y } within 50 of the centre
rng.pointOnCircle()                         // a random direction of length 1
rng.angle()                                 // 0 to 2π
```

### …generate terrain or maps?

```javascript
import { createNoise } from 'luckbox/noise'

const noise = createNoise('world-1')
const height = noise.fbm2d(x / 200, y / 200)   // smooth, −1 to 1, with layers of detail
const tile = height > 0.4 ? 'mountain' : height > 0 ? 'grass' : 'water'
noise.noise3d(x, y, time)                      // animated noise: use z as time
```

### …check two players are still in sync?

```javascript
if (rng.hash() !== hostHash) resync()   // a short fingerprint of the exact position
```

### …make old `Math.random` code repeatable in tests?

```javascript
const seeded = luck.patchMathRandom('test-seed')
runOldCode()       // every Math.random() call is now repeatable
seeded.restore()
```

### …switch from seedrandom without changing my worlds?

```javascript
// before: import seedrandom from 'seedrandom'
import { seedrandom } from 'luckbox/seedrandom'
const rng = seedrandom('hello.')
rng()              // 0.9282578795792454: exactly the same numbers as seedrandom
```

Checked against the real seedrandom package across 313 seeds and 62,600 numbers, with no differences. Saved states work in both.

## API

| | |
|---|---|
| `luck(seed?, { algorithm? })` | A new generator. Seeds can be text, numbers, bigints or lists (`[worldSeed, x, y]`). `42` and `'42'` give the same results. |
| `luck.from(state)` | Continue from `rng.state()` (the object or its JSON text) |
| `luck.daily(options?)`, `luck.weekly(options?)` | The same generator for every player today or this week (`salt`, `timeZone`, `resetHour`, `date`) |
| `luck.dayKey()`, `luck.weekKey()` | `'2026-11-26'`, `'2026-W48'` |
| `luck.odds(notation)` | Exact odds for a dice notation |
| `luck.weights(...)` | A reusable weighted table, with `table.pick(rng)` and `table.odds()` |
| `luck.patchMathRandom(seed?)` | A seeded `Math.random` until `restore()` |
| `rng.float()`, `rng.int(min, max)`, `rng.range(min, max)` | A decimal in [0, 1); a whole number (both ends included); a decimal in [min, max) |
| `rng.chance(p)`, `rng.bool()`, `rng.sign()` | `true` with chance `p`; a coin flip; `1` or `-1` |
| `rng.pick(list)`, `rng.sample(list, n)` | One item; `n` different items |
| `rng.shuffle(list)`, `rng.shuffleInPlace(array)` | A shuffled copy; shuffle the array itself |
| `rng.weighted(...)` | One item by weight |
| `rng.roll(notation)`, `rng.dice(notation)` | A dice total; every die, plus a readable line |
| `rng.loot(table, options?)` | A loot table: `open()`, `openMany(n)`, `odds()`, `rates()` (simple tables), `simulate(n)`, `state()` |
| `rng.bag(items, options?)`, `rng.deck(cards, options?)` | A shuffle bag; a deck with draw, discard, hand, `putBack` and `reshuffle` |
| `rng.fairChance(p)` | A chance with no long streaks: `roll()`, `chanceNow`, `worstCase`, `state()` |
| `rng.normal(mean, sd)`, `rng.triangular(min, max, mode)`, `rng.exponential(rate)`, `rng.poisson(mean)` | Shaped randomness |
| `rng.angle()`, `rng.pointInCircle(r)`, `rng.pointOnCircle(r)`, `rng.pointInRect(w, h)`, `rng.scatter(w, h, spacing)` | Geometry |
| `rng.id(length?, alphabet?)`, `rng.uuid()` | Readable codes; seeded UUIDs (v4 format) |
| `rng.fork(name)`, `rng.clone()`, `rng.hash()` | An independent named stream; a copy; a sync fingerprint |
| `rng.state()`, `rng.seed`, `rng.draws`, `rng.uint32()` | Save; the seed; numbers drawn so far; raw 32-bit output |
| `createNoise(seed)` from `luckbox/noise` | `noise2d`, `noise3d`, `fbm2d`, `fbm3d`, all from −1 to 1 |
| `seedrandom(seed)` from `luckbox/seedrandom` | A drop-in replacement for the `seedrandom` package |

## Same results everywhere

- **Own maths.** JavaScript's `Math.log` and `Math.exp` can round the last bit differently in different browsers. luckbox uses its own versions, built only from `+ − × ÷`, which IEEE 754 makes identical everywhere. They're accurate to within one unit in the last place.
- **Locked results.** Thousands of results per release are compared with saved values. Any change fails the build.
- **Checked against references.** The generators match their C reference code, and seedrandom mode matches the real package.
- **Tested across builds.** Node and Chrome give identical results on every release, for every build: `import`, `require` and the script tag.

`sfc32` is the default generator: fast, with a 128-bit state, and it passes the PractRand and TestU01 test suites. You can also choose `'xoshiro128**'`, or `'mulberry32'` (the tiniest, fine for visuals): `luck('seed', { algorithm: 'xoshiro128**' })`.

## Errors

Mistakes throw a `LuckboxError` with a stable `code` (`BAD_SEED`, `BAD_ARGUMENT`, `EMPTY_LIST`, `BAD_STATE`, `BAD_DICE`, `BAD_DATE`, `BAD_TIMEZONE`, `BAD_ALGORITHM`) and a message that says how to fix it:

```
luckbox: bad dice "4d6kh5": can't keep 5 of 4 dice.
luckbox: int(min, max) needs whole numbers, got int(1, 6.5). Use range() for decimals.
luckbox: loot(): put pity in the second argument: rng.loot(table, { pity: ... }).
```

## FAQ

**Is it secure enough for passwords or real-money gambling?** No. Seeded randomness can be predicted by anyone who knows the seed. For secrets, use `crypto.getRandomValues()`.

**Will my seeds give different results after I update luckbox?** No. Every result is locked by tests, and a change to any seeded result counts as a breaking bug.

**Where does it run?** In modern browsers and Node 20+, and it's built to run in any modern JavaScript runtime (Bun, Deno, web workers). It has no dependencies and doesn't even need `TextEncoder`.

---

Part of the **Zedbury Game Kit** · MIT License
