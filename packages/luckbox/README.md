# luckbox

**Randomness for games that you can replay.** The same seed gives the same results on every device, in every version. Dice notation, loot tables, weighted picks, shuffle bags, card decks and daily challenges are built in.

```js
import { luck } from 'luckbox'

const rng = luck('my-seed')                    // same seed → same results, everywhere
rng.int(1, 6)                                  // 4
rng.pick(['sword', 'bow', 'staff'])            // 'bow'
rng.roll('4d6kh3')                             // 14: roll 4 dice, keep the highest 3
rng.weighted({ gold: 70, gem: 25, crown: 5 })  // 'gold'

const today = luck.daily()                     // the same daily level for every player
const saved = rng.state()                      // save it, load it later, continue exactly
```

- **Replayable:** pure 32-bit integer maths with no platform randomness, so a seed gives the same results everywhere (checked in Node and Chrome on every release). Future versions never change them, because every release is tested against locked results.
- **Game-ready:** dice notation with exact odds, loot tables, alias-method weighted picks, shuffle bags, decks, daily and weekly seeds, independent streams
- **Fair:** no modulo bias, full 53-bit decimals, generators checked bit for bit against their C reference code
- **Small:** about 9 KB minified + brotli for everything, no dependencies
- **Friendly:** full TypeScript types, an example on every method, and errors that say how to fix the problem

## Install

```bash
npm install luckbox
```

Single-file HTML game? Use a script tag. Everything is on `window.luckbox`:

```html
<script src="https://cdn.jsdelivr.net/npm/luckbox@0.1"></script>
<script>
  const rng = luckbox.luck('my-seed')
  console.log(rng.roll('2d6'))
</script>
```

Or import it straight from a CDN:

```js
import { luck } from 'https://cdn.jsdelivr.net/npm/luckbox@0.1/+esm'
```

## How do I…

### …make a daily level that's the same for every player?

```js
const today = luck.daily({ salt: 'my-game' })   // seed: 'my-game:daily:2026-11-26'
const level = buildLevel(today)
```

By default the day changes at midnight UTC, so the whole world shares one daily. To follow a local calendar or a morning reset, pass `timeZone: 'Asia/Kolkata'` and `resetHour: 4`. `luck.weekly()` works the same way with ISO weeks. To replay any past day, use its seed: `luck('my-game:daily:2026-11-25')`.

### …let players replay or share a run?

```js
const run = luck()            // picks a fresh seed
showOnScreen(run.seed)        // 'k3f9x2pqm7': readable, no look-alike letters
// later, anyone with the code:
const replay = luck('k3f9x2pqm7')
```

### …save the game and continue exactly where it left off?

```js
save.rng = rng.state()        // plain JSON
// or: JSON.stringify(rng)

const rng = luck.from(save.rng)   // the next numbers are exactly the ones you would have got
```

### …stop new code from changing my world generation?

Give each system its own stream with `fork()`. A fork depends only on the seed and its name, never on how many numbers were drawn before, so adding an extra random call to your weather code can't change your dungeon.

```js
const world = luck(seed)
const terrain = world.fork('terrain')
const loot = world.fork('loot')
const chunk = world.fork('chunk').fork(`${x},${y}`)   // forks can be nested
```

### …roll dice?

```js
rng.roll('2d6+3')               // 11
rng.roll('2d20kh1')             // advantage: the better of two d20s
rng.dice('4d6kh3+2').text       // '4d6kh3 (6, 5, 1 dropped, 3) + 2 = 16'
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

Odds are worked out exactly, with maths (not by rolling):

```js
const odds = luck.odds('2d6')
odds.chance(7)       // 0.1667 (6 in 36)
odds.atLeast(10)     // 0.1667
odds.mean            // 7
odds.totals          // [{ total: 2, chance: 0.0278 }, …]
```

### …make a loot table and show players the drop rates?

```js
const chest = rng.loot({ common: 80, rare: 18, epic: 2 })
chest.open()         // 'common'
chest.openMany(10)   // ['common', 'rare', …]
chest.odds()         // { common: 0.8, rare: 0.18, epic: 0.02 }
```

With whole-number weights, drops are exact: an item with weight 2 out of 100 drops exactly 2% of the time, with no rounding error.

### …pick by weight?

```js
rng.weighted({ slime: 10, bat: 5, dragon: 1 })
rng.weighted([[swordObject, 3], [shieldObject, 1]])
rng.weighted(enemies, (e) => e.spawnWeight)

// Picking from the same big table many times? Build it once (the alias method):
const spawns = luck.weights(enemies, (e) => e.spawnWeight)
spawns.pick(rng)
```

### …avoid unlucky streaks (Tetris-style 7-bag)?

```js
const pieces = rng.bag(['I', 'O', 'T', 'S', 'Z', 'J', 'L'], { noRepeat: true })
pieces.next()        // every piece comes out once before any repeats
pieces.peek()        // the next-piece preview
```

### …make a deck of cards?

```js
const deck = rng.deck(cards)
const hand = deck.drawMany(5)
deck.discard(hand[0])
deck.putBack(hand[1], 'bottom')
deck.reshuffle()     // the discard pile goes back in, everything is shuffled
```

When the draw pile runs out, the discards are shuffled back in automatically (turn this off with `{ autoReshuffle: false }`). Bags and decks save too: `bag.state()` and `deck.state()`, restored with `rng.bag(items, { state })` and `rng.deck(cards, { state })`.

## API

| | |
|---|---|
| `luck(seed?, { algorithm? })` | A new generator. Seeds can be text, numbers, bigints or lists (`[worldSeed, x, y]`). `42` and `'42'` give the same results. |
| `luck.from(state)` | Continue from `rng.state()` (the object or its JSON text) |
| `luck.daily(options?)`, `luck.weekly(options?)` | The same generator for every player today or this week (`salt`, `timeZone`, `resetHour`, `date`) |
| `luck.dayKey()`, `luck.weekKey()` | `'2026-11-26'`, `'2026-W48'` |
| `luck.odds(notation)` | Exact odds for a dice notation |
| `luck.weights(...)` | A reusable weighted table, with `table.pick(rng)` and `table.odds()` |
| `rng.float()` | A decimal from 0 up to (not including) 1, with 53 bits of precision |
| `rng.int(min, max)` | A whole number, both ends included |
| `rng.range(min, max)` | A decimal from `min` up to (not including) `max` |
| `rng.chance(p)`, `rng.bool()`, `rng.sign()` | `true` with chance `p`; a coin flip; `1` or `-1` |
| `rng.pick(list)`, `rng.sample(list, n)` | One item; `n` different items |
| `rng.shuffle(list)`, `rng.shuffleInPlace(array)` | A shuffled copy; shuffle the array itself |
| `rng.weighted(...)` | One item by weight |
| `rng.roll(notation)`, `rng.dice(notation)` | A dice total; every die, plus a readable line |
| `rng.loot(table)` | A loot table with `open()`, `openMany(n)` and `odds()` |
| `rng.bag(items, options?)` | A shuffle bag with `next()`, `peek()` and `state()` |
| `rng.deck(cards, options?)` | A deck with draw, discard, hand, `putBack`, `reshuffle` and `state()` |
| `rng.id(length?, alphabet?)`, `rng.uuid()` | Readable codes; seeded UUIDs (v4 format) |
| `rng.fork(name)`, `rng.clone()` | An independent named stream; a copy at the same position |
| `rng.state()`, `rng.seed`, `rng.draws`, `rng.uint32()` | Save; the seed; numbers drawn so far; raw 32-bit output |

## Algorithms

`sfc32` is the default: fast, with a 128-bit state, and it passes the PractRand and TestU01 test suites. You can also choose `'xoshiro128**'`, or `'mulberry32'` (the tiniest, fine for visuals). All three are checked bit for bit against their C reference implementations.

```js
luck('seed', { algorithm: 'xoshiro128**' })
```

## Errors

Mistakes throw a `LuckboxError` with a stable `code` (`BAD_SEED`, `BAD_ARGUMENT`, `EMPTY_LIST`, `BAD_STATE`, `BAD_DICE`, `BAD_DATE`, `BAD_TIMEZONE`, `BAD_ALGORITHM`) and a message that says how to fix it:

```
luckbox: bad dice "4d6kh5": can't keep 5 of 4 dice.
luckbox: int(min, max) needs whole numbers, got int(1, 6.5). Use range() for decimals.
```

## FAQ

**Is it secure enough for passwords or gambling?** No. Seeded randomness can be predicted by anyone who knows the seed. For secrets, use `crypto.getRandomValues()`.

**Will my seeds give different results after I update luckbox?** No. Every result is locked by tests, and a change to any seeded result counts as a breaking bug.

**Where does it run?** In modern browsers and Node 20+, and it's built to run in any modern JavaScript runtime (Bun, Deno, web workers). It has no dependencies and doesn't even need `TextEncoder`.

---

Part of the **Zedbury Game Kit** · MIT License
