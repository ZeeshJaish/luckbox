# luckbox examples

Each one runs with Node 20+ after `npm install luckbox`, and every one is run by the test suite, so they always work.

| Example | What it shows | Run it |
|---|---|---|
| [daily-puzzle.mjs](daily-puzzle.mjs) | The same daily word for every player, time zones, replaying past days | `node examples/daily-puzzle.mjs` |
| [gacha-banner.mjs](gacha-banner.mjs) | Pity, the real drop rates to show players, 10-pulls, saving, balance checks | `node examples/gacha-banner.mjs` |
| [roguelike-dungeon.mjs](roguelike-dungeon.mjs) | A dungeon floor from one seed, with forks so systems never disturb each other | `node examples/roguelike-dungeon.mjs` |
| [card-game.mjs](card-game.mjs) | A deck with draw, discard and reshuffle, saved mid-game | `node examples/card-game.mjs` |
| [fair-crits.mjs](fair-crits.mjs) | Crits without unlucky streaks, against plain chance | `node examples/fair-crits.mjs` |
| [world-map.mjs](world-map.mjs) | Terrain from noise, and trees scattered without overlaps | `node examples/world-map.mjs` |
