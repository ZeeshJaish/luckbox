# Moving from seedrandom to luckbox

[seedrandom](https://www.npmjs.com/package/seedrandom) has been the standard seeded random library for years, and millions of projects still install it every week. Its last release was in 2019. luckbox is a maintained replacement, and you can switch **without changing a single number your game makes**.

## Step 1: swap the import (same numbers, guaranteed)

```javascript
// before
import seedrandom from 'seedrandom'

// after
import { seedrandom } from 'luckbox/seedrandom'
```

Everything else stays the same:

```javascript
const rng = seedrandom('hello.')
rng()          // 0.9282578795792454, the same as seedrandom
rng.int32()    // the same
rng.quick()    // the same
rng.double()   // the same
```

This mode is checked against the real seedrandom package across 313 seeds and 62,600 numbers, including odd seeds like objects, arrays, emoji and huge numbers. There are no differences. Saved states move both ways:

```javascript
const rng = seedrandom('save me', { state: true })
const saved = rng.state()                        // the same { i, j, S } shape as seedrandom
const again = seedrandom('', { state: saved })   // continues exactly
```

It's 1 KB, has no dependencies, and comes with full TypeScript types.

## Step 2: use luckbox for new code

Your existing worlds keep their numbers through `luckbox/seedrandom`. For anything new, use `luck()`, which is faster (about 9 times faster than seedrandom's `rng()`) and does far more:

| seedrandom | luckbox |
|---|---|
| `const rng = seedrandom('seed')` | `const rng = luck('seed')` |
| `rng()` | `rng.float()` |
| `Math.floor(rng() * 6) + 1` | `rng.int(1, 6)` (no bias) |
| `arr[Math.floor(rng() * arr.length)]` | `rng.pick(arr)` |
| hand-written Fisher–Yates | `rng.shuffle(arr)` |
| `rng.int32()` | `rng.uint32()` (unsigned) |
| `seedrandom('s', { state: true }).state()` | `rng.state()` (plain JSON, or `JSON.stringify(rng)`) |
| `seedrandom('', { state })` | `luck.from(state)` |
| `seedrandom()` (auto-seed) | `luck()`, which also tells you the seed: `rng.seed` |
| `seedrandom('s', { global: true })` | `luck.patchMathRandom('s')`, with `restore()` |

Things seedrandom never had: dice notation with exact odds, loot tables with pity, weighted picks, shuffle bags, decks, daily seeds, `fork()` streams, bell curves, scatter, noise, and same-everywhere maths.

## What's different

- **`luck(seed)` numbers differ from `seedrandom(seed)` numbers.** luckbox uses the faster `sfc32` generator. Keep `luckbox/seedrandom` for anything that must reproduce old results.
- **No auto-seeding or entropy pool in seedrandom mode.** `seedrandom()` with no seed throws. Use `luck()` for fresh seeds, because it shows you the seed so the run can be replayed.
- **The other algorithms (`alea`, `xor128`, `tychei` and so on) aren't included.** Only seedrandom's default ARC4 generator, the one `seedrandom(seed)` uses, is copied exactly. luckbox's own generators (`sfc32`, `xoshiro128**`, `mulberry32`) cover the same ground.
