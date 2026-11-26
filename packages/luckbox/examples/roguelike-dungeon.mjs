// A roguelike floor: rooms, corridors, monsters and loot from one seed.
// Each part has its own fork, so changing the loot code never moves the rooms.
import { luck } from 'luckbox'

const W = 48
const H = 18
const run = luck('dungeon-run-7')
const floor = run.fork('floor').fork(1)
const layout = floor.fork('layout')
const spawns = floor.fork('monsters')
const chests = floor.fork('loot')

const map = Array.from({ length: H }, () => Array(W).fill('#'))
const rooms = []
for (let tries = 0; tries < 60 && rooms.length < 7; tries++) {
  const w = layout.int(5, 10)
  const h = layout.int(3, 5)
  const x = layout.int(1, W - w - 1)
  const y = layout.int(1, H - h - 1)
  if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue
  rooms.push({ x, y, w, h })
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) map[j][i] = '.'
}
const centre = (r) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) })
for (let k = 1; k < rooms.length; k++) {
  const a = centre(rooms[k - 1])
  const b = centre(rooms[k])
  for (let i = Math.min(a.x, b.x); i <= Math.max(a.x, b.x); i++) map[a.y][i] = '.'
  for (let j = Math.min(a.y, b.y); j <= Math.max(a.y, b.y); j++) map[j][b.x] = '.'
}
const monsterTable = luck.weights({ g: 50, o: 30, T: 15, D: 5 }) // goblin, orc, troll, dragon
for (const room of rooms.slice(1)) {
  const n = spawns.poisson(1.2)
  for (let k = 0; k < n; k++) map[room.y + spawns.int(0, room.h - 1)][room.x + spawns.int(0, room.w - 1)] = monsterTable.pick(spawns)
}
const chestTable = chests.loot({ rolls: [1, 2], drops: { gold: { weight: 60, amount: '2d6*5' }, potion: 30, relic: 10 } })
const loot = rooms.map(() => chestTable.open())
const start = centre(rooms[0])
map[start.y][start.x] = '@'
console.log(map.map((row) => row.join('')).join('\n'))
console.log(`\n${rooms.length} rooms · chest in room 2: ${JSON.stringify(loot[1])}`)
