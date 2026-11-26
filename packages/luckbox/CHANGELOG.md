# Changelog

All notable changes to luckbox are listed here. This project follows [Semantic Versioning](https://semver.org).

## Unreleased

- Seeded generators: sfc32 (default), xoshiro128**, mulberry32, verified against C reference code.
- `luck(seed)` with text, number, bigint or list seeds; `luck()` picks a fresh, replayable seed.
- `uint32`, `float`, `int`, `range`, `chance`, `bool`, `sign`, `pick`, `sample`, `shuffle`, `shuffleInPlace`, `id`, `uuid`.
- Save and load with `state()` / `luck.from()`, `clone()`, and `fork(name)` streams.
- `luck.daily()`, `luck.weekly()`, `luck.dayKey()`, `luck.weekKey()` with time zones and reset hours.
- Results locked by tests so they never change between versions.
- Project setup: ESM, CommonJS, type definitions and a `<script>` tag build.
