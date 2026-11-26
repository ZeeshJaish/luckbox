// A small world map from noise, with trees scattered so they never overlap.
import { luck } from 'luckbox'
import { createNoise } from 'luckbox/noise'

const W = 64
const H = 22
const world = luck('world-1')
const height = createNoise(world.fork('terrain'))
const tiles = []
for (let y = 0; y < H; y++) {
  let row = ''
  for (let x = 0; x < W; x++) {
    const h = height.fbm2d(x / 22, y / 11, { octaves: 5 })
    row += h > 0.45 ? '^' : h > 0.2 ? 'n' : h > -0.05 ? '.' : h > -0.2 ? ',' : '~'
  }
  tiles.push([...row])
}
for (const { x, y } of world.fork('trees').scatter(W, H, 3)) {
  const t = tiles[Math.floor(y)][Math.floor(x)]
  if (t === '.' || t === ',') tiles[Math.floor(y)][Math.floor(x)] = 'T'
}
console.log(tiles.map((r) => r.join('')).join('\n'))
console.log('\n~ water  , shore  . grass  T tree  n hills  ^ mountains')
