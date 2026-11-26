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
- **Fair.** No modulo bias, full 53-bit decimals, and generators checked bit for bit against their C reference code. A battery of statistical tests runs on every release, and it catches a known-bad generator.
- **Fast.** About 430 million random numbers a second: faster than `Math.random()` and about 9 times faster than seedrandom.
- **Small.** About 14 KB minified + brotli with no dependencies. Noise and seedrandom compatibility are separate imports, so you only download what you use.
- **Friendly.** Full TypeScript types, an example on every method, and errors that tell you how to fix the problem.

## Install

```bash
npm install luckbox
```

Single-file HTML game? Use one script tag. Everything, add-ons included, is on `window.luckbox`:

```html
<script src="https://cdn.jsdelivr.net/npm/luckbox@0.5"></script>
<script>
  const rng = luckbox.luck('my-seed')
  console.log(rng.roll('2d6'))
</script>
```

Or import it straight from a CDN:

```javascript
import { luck } from 'https://cdn.jsdelivr.net/npm/luckbox@0.5/+esm'
```

## Try it without writing code

```bash
npx luckbox roll 4d6kh3 --times 6 --seed hero
```

```text
8  12  11  15  12  13
average 11.83 · lowest 8 · highest 15
seed hero
```

```bash
npx luckbox odds 2d6
```

```text
2d6  min 2 · max 12 · average 7
total  chance  this or more
    2   2.78%          100%  █████
    3   5.56%        97.22%  █████████
    4   8.33%        91.67%  ██████████████
    5  11.11%        83.33%  ███████████████████
    6  13.89%        72.22%  ███████████████████████
    7  16.67%        58.33%  ████████████████████████████
    8  13.89%        41.67%  ███████████████████████
    9  11.11%        27.78%  ███████████████████
   10   8.33%        16.67%  ██████████████
   11   5.56%         8.33%  █████████
   12   2.78%         2.78%  █████
```

```bash
npx luckbox loot banner.json --rates
```

```text
drop   chance  real rate with pity
star5   0.60%                1.58%  ▏
star4   5.10%               12.48%  ███
star3  94.30%               85.94%  ████████████████████
seed g
```

There's also `npx luckbox pick`, `shuffle`, `daily` and `seed`. Run `npx luckbox --help` for the full list.

## Building with AI?

If Claude, ChatGPT, Cursor or another assistant is writing your game, paste this:

```text
Use the npm package "luckbox" for all randomness in this game (never Math.random for gameplay).
Create one generator per run with luck(seed) and show rng.seed so runs can be replayed.
Give each system its own stream with rng.fork('loot'), rng.fork('enemies') and so on.
Use rng.int / pick / shuffle / weighted / roll('2d6+3') / loot(table, { pity }) instead of hand-written maths.
Save and load with rng.state() and luck.from(state).
Read node_modules/luckbox/AGENTS.md for the full API.
```

luckbox ships an [`AGENTS.md`](https://unpkg.com/luckbox/AGENTS.md) (rules, the full API and patterns) and an [`llms.txt`](https://unpkg.com/luckbox/llms.txt), so coding agents that read `node_modules` use it correctly.

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

Checked against the real seedrandom package across 313 seeds and 62,600 numbers, with no differences. Saved states work in both. For new code, `luck()` is about 9 times faster and does much more:

| seedrandom | luckbox |
|---|---|
| `Math.floor(rng() * 6) + 1` | `rng.int(1, 6)` (no bias) |
| `arr[Math.floor(rng() * arr.length)]` | `rng.pick(arr)` |
| `seedrandom('s', { state: true }).state()` | `rng.state()` (plain JSON) |
| `seedrandom('s', { global: true })` | `luck.patchMathRandom('s')` |

The full guide is [docs/migrating-from-seedrandom.md](https://unpkg.com/browse/luckbox/docs/migrating-from-seedrandom.md), and it ships with the package.

## Examples

Small games you can run with Node. They ship with the package in `node_modules/luckbox/examples` ([browse them](https://unpkg.com/browse/luckbox/examples/)), and the test suite runs every one:

| | |
|---|---|
| `daily-puzzle.mjs` | A Wordle-style daily word, the same for every player |
| `gacha-banner.mjs` | Pity, the real drop rates players are shown, 10-pulls, saving, balance checks |
| `roguelike-dungeon.mjs` | A dungeon floor from one seed, with forks so systems never disturb each other |
| `card-game.mjs` | A deck with draw, discard and reshuffle, saved mid-game |
| `fair-crits.mjs` | Crits without unlucky streaks, against plain chance |
| `world-map.mjs` | Terrain from noise, and trees scattered without overlaps |

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

## Proof

**The same results everywhere.** One fingerprint of 31 checks (dice, odds, bell curves, Poisson, noise, pity, seedrandom mode and more) gives identical results, to the last bit, on:

| Runtime | Engine | Result |
|---|---|---|
| Node 24 | V8 | ✅ the reference |
| Bun 1.4 | JavaScriptCore | ✅ identical |
| Deno 2.9 | V8 | ✅ identical |
| Chrome 152 | V8 | ✅ identical |
| Safari (WebKit 27.2) | JavaScriptCore | ✅ identical |

Run it yourself with `npm run test:cross`. The page `test/browser/index.html` does the same check in any browser you open it in.

**Fair, by the numbers.** Every generator passes these tests on every release, on both the high and the low bits:

| Test | What it catches |
|---|---|
| Monobit | More ones than zeros |
| Byte frequency (chi-square, 4 million bytes) | Some values coming up too often |
| Pairs on a 32 × 32 grid | One number predicting the next |
| Serial correlation | Patterns between neighbours |
| Runs | true/false/true/false rhythms |
| Birthday spacings (Marsaglia) | Hidden lattice structure |

To show these tests can fail, a classic flawed generator (the C library LCG) fails three of them by a wide margin. luckbox's three generators pass all of them.

**Exact maths, checked by brute force.** Dice odds match published tables and every keep/drop combination enumerated by brute force, and they agree with a million real rolls. Pity `rates()` agree with a million simulated opens. Property tests try thousands of random inputs per rule: ranges, shuffles, random dice notations, weights, save/load at any point, forks, and pity limits.

## Speed

Millions of results per second on an Apple M4, Node 24 (`npm run bench`, each row in its own process):

| | Millions / s |
|---|---|
| `Math.random()` (not seedable) | 266 |
| `rng.float()`, sfc32 (default) | 428 |
| `rng.float()`, mulberry32 | 553 |
| `rng.int(1, 6)` | 549 |
| seedrandom `rng()` (the package) | 48 |
| `rng.normal()` | 25 |
| `rng.roll('2d6')` | 11 |
| loot table `open()` | 7.8 |

## How results stay the same

- **Own maths.** JavaScript's `Math.log` and `Math.exp` really do round the last bit differently on different machines (CI caught macOS and Linux disagreeing). luckbox uses its own versions, built only from `+ − × ÷`, which IEEE 754 makes identical everywhere. They're accurate to about one unit in the last place.
- **Locked results.** Thousands of results per release are compared with saved values. Any change fails the build.
- **Checked against references.** The generators match their C reference code, and seedrandom mode matches the real package.
- **Tested across builds and runtimes.** `import`, `require` and the script tag give identical results, in every runtime listed above.

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

**Where does it run?** Everywhere modern JavaScript runs: browsers, Node 20+, Bun, Deno and web workers. It's tested on Node, Bun, Deno, Chrome and Safari's engine. It has no dependencies and doesn't even need `TextEncoder`.

---

Part of the **Zedbury Game Kit** · MIT License
