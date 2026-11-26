# Changelog

All notable changes to luckbox are listed here. This project follows [Semantic Versioning](https://semver.org).

## 0.3.0 (2026-11-27)

Proof that it's reliable, and faster.

- Same results to the last bit on Node 24, Bun 1.4, Deno 2.9, Chrome 152 and Safari's WebKit 27.2 (`npm run test:cross`).
- A statistical fairness battery on all three generators (monobit, byte frequency, pairs, serial correlation, runs, birthday spacings), testing both the high and the low bits. A known-bad LCG fails it.
- A million real rolls agree with the exact dice odds, and a million opens agree with the pity `rates()`.
- Property tests over thousands of random inputs (ranges, shuffles, random dice notations, weights, save/load, forks, pity).
- Faster: `int()` reuses its rejection limit (22 to 549 million per second), and loot tables without pity skip the pity bookkeeping. Results are unchanged.
- `luck.odds()` reports notations that are too big to work out at once, instead of after a second of work.
- A speed benchmark (`npm run bench`): `rng.float()` is faster than `Math.random()` and about 9 times faster than seedrandom.

## 0.2.0 (2026-11-27)

- Loot pity: hard pity (`pity: { epic: 90 }`) and soft pity (`softPity: { epic: { after: 73, add: 0.06 } }`), saved with `state()`.
- `rates()` works out the real long-run drop rates, pity included (for gacha odds disclosure). `simulate(n)` runs balancing tests on its own fork.
- Full loot tables (`{ drops: ... }`): amounts (`[10, 50]` or dice), several rolls, `unique`, `always`, `nothing`, `when` conditions with a context, and tables inside tables.
- Shaped randomness: `normal()`, `exponential()`, `poisson()`, `triangular()`.
- Geometry: `angle()`, `pointInCircle()`, `pointOnCircle()`, `pointInRect()`, and `scatter()` (Poisson-disk sampling).
- `fairChance(p)`: streak-free chances (pseudo-random distribution).
- `rng.hash()` for multiplayer sync checks, and `luck.patchMathRandom()` for tests.
- New `luckbox/noise`: seeded simplex noise (`noise2d`, `noise3d`, `fbm2d`, `fbm3d`).
- New `luckbox/seedrandom`: the same numbers as the `seedrandom` package (checked on 62,600 values).
- Own deterministic `ln`/`exp` (within 1 ulp of the built-ins), so the new features and dice odds give bit-identical results in every browser.
- The README examples now show real values, checked by tests.

## 0.1.0 (2026-11-26)

First release.

- Dice notation: `2d6+3`, keep and drop (`4d6kh3`, `2d20kl1`, `4d6dl1`), exploding (`3d6!`), rerolls (`r1`, `r<2`, `ro1`), `d%`, fudge dice (`4dF`), multipliers (`5d4*10`).
- `rng.roll()` for totals, `rng.dice()` for every die plus a readable line, `luck.odds()` for exact odds.
- Weighted picks with the alias method, exact for whole-number weights: `rng.weighted()`, `luck.weights()`.
- `rng.loot()` loot tables with `open()`, `openMany()` and `odds()`.
- `rng.bag()` shuffle bags (with `noRepeat`) and `rng.deck()` card decks, both able to save and load.
- Seeded generators: sfc32 (default), xoshiro128**, mulberry32, verified against C reference code.
- `luck(seed)` with text, number, bigint or list seeds; `luck()` picks a fresh, replayable seed.
- `uint32`, `float`, `int`, `range`, `chance`, `bool`, `sign`, `pick`, `sample`, `shuffle`, `shuffleInPlace`, `id`, `uuid`.
- Save and load with `state()` / `luck.from()`, `clone()`, and `fork(name)` streams.
- `luck.daily()`, `luck.weekly()`, `luck.dayKey()`, `luck.weekKey()` with time zones and reset hours.
- Results locked by tests so they never change between versions.
- Project setup: ESM, CommonJS, type definitions and a `<script>` tag build.
