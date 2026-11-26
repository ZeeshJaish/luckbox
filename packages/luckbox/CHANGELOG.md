# Changelog

All notable changes to luckbox are listed here. This project follows [Semantic Versioning](https://semver.org).

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
