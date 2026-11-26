# Changelog

All notable changes to luckbox are listed here. This project follows [Semantic Versioning](https://semver.org).

## 1.1.0 (2026-11-27)

Gacha banners and names. Nothing existing changed: every seed gives the same results as in 1.0.

- **`rng.gacha(banner)`**: a full gacha banner built on loot pity.
  - Featured (rate-up) items with the 50/50 and its guarantee: lose it and the next drop of that rarity is featured. `featuredChance` and `guarantee` can be set per rarity.
  - Spark: every pull earns a point, and `redeem(item)` spends them on a chosen item.
  - `itemRates()`: every item's real long-run rate, pity and guarantee included. A 50/50 with a guarantee makes the featured item ⅔ of its rarity, not half.
  - `disclosure()`: base and real rates, pity and the featured rules as sentences for your odds page.
  - `simulate(n)` runs on its own fork. `state()` saves pity, the guarantee, sparks and the pull count.
- **`luckbox/names`**: seeded names in four styles, `'fantasy'`, `'place'`, `'planet'` and `'tavern'`, or learned from your own example names with a letter-level Markov chain.
  - Learned names never copy an example unless you pass `allowExamples`.
  - Short lists fall back to one letter of context where two letters only continue one way, so they still make plenty of new names.
  - Accents and other scripts are handled as whole letters.
  - It's a separate import of under 3 KB, and `luckbox.names` with the script tag.
- CLI: `npx luckbox gacha banner.json` (pulls, `--disclosure`, `--simulate`) and `npx luckbox names [style | a,b,c | file.txt]`.
- The cross-runtime fingerprint grew to 34 checks, adding gacha and names, and gives identical results on every engine.
- `examples/gacha-banner.mjs` now uses `rng.gacha()`. The playground shows item names, the 50/50, spark and town names.

## 1.0.0 (2026-11-27)

The first stable release. From now on luckbox follows semantic versioning:

- **The API is stable.** Breaking changes only come with a new major version.
- **Seeded results never change**, even across major versions. Every release is tested against results locked since 0.1.0, and any change to a seeded result counts as a bug.
- CDN links now use `luckbox@1`.

## 0.5.0 (2026-11-27)

Easy for people and AI tools to find and use correctly.

- `AGENTS.md`: rules, the full API and patterns for AI coding agents, shipped in the package. A test checks that every method it names exists.
- `llms.txt`: a short summary for AI search and assistants.
- README: a "Building with AI?" prompt to paste into Claude, ChatGPT or Cursor.
- A docs site (`site/`): a landing page with an FAQ, recipes for Phaser, PixiJS, Three.js, KAPLAY and plain canvas, luckbox vs seedrandom vs `Math.random`, the playground, `llms-full.txt`, a sitemap, structured data and a social image. Tests check every link and parse every recipe's code.
- More npm keywords.
- Public repo [github.com/ZeeshJaish/luckbox](https://github.com/ZeeshJaish/luckbox) and website [zeeshjaish.github.io/luckbox](https://zeeshjaish.github.io/luckbox/). CI shows identical results on Node 20, 22 and 24, Bun, Deno, Chrome, Firefox and WebKit on every push.

## 0.4.0 (2026-11-27)

Easy to try, easy to learn.

- `npx luckbox`: roll dice, show exact odds as a chart, pick, shuffle, open loot tables (from JSON or a file) with real pity rates and simulations, daily seeds and fresh seeds. Every command can be replayed with `--seed`.
- `examples/`: a daily puzzle, a gacha banner, a roguelike dungeon, a card game, fair crits and a world map. Shipped in the package and run by the tests.
- `docs/migrating-from-seedrandom.md`: switch without changing a number, and an API mapping table.
- A playground page (`playground/index.html`) for dice, a pity banner, crit streaks and noise worlds, all from one seed with a Replay button.

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
