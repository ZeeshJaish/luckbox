// Words and code for the luckbox site. build.mjs turns this into pages.

export const SITE = {
  name: 'luckbox',
  tagline: 'Seeded random for games, that you can replay',
  description:
    'luckbox is a seeded random number generator for JavaScript and TypeScript games. The same seed gives the same results everywhere, with dice notation, loot tables with gacha pity, weighted picks, shuffle bags, noise and daily challenges built in.',
  cdn: 'https://cdn.jsdelivr.net/npm/luckbox@1',
}

export const PROMPT = `Use the npm package "luckbox" for all randomness in this game (never Math.random for gameplay).
Create one generator per run with luck(seed) and show rng.seed so runs can be replayed.
Give each system its own stream with rng.fork('loot'), rng.fork('enemies') and so on.
Use rng.int / pick / shuffle / weighted / roll('2d6+3') / loot(table, { pity }) instead of hand-written maths.
Save and load with rng.state() and luck.from(state).
Read node_modules/luckbox/AGENTS.md for the full API.`

export const QUICKSTART = `import { luck } from 'luckbox'

const rng = luck('my-seed')                    // same seed → same results, everywhere
rng.int(1, 6)                                  // 2
rng.pick(['sword', 'bow', 'staff'])            // 'staff'
rng.roll('4d6kh3')                             // 13: roll 4 dice, keep the highest 3
rng.weighted({ gold: 70, gem: 25, crown: 5 })  // 'gold'

const saved = rng.state()                      // save it, load it later, continue exactly`

export const FEATURES = [
  { tag: 'Dice', color: 'sky', title: 'Dice with exact odds', code: "rng.roll('4d6kh3')\nluck.odds('2d6').chance(7) // 0.1667", text: 'Keep, drop, explode, reroll, fudge dice and multipliers. The odds are worked out with maths, not by rolling.' },
  { tag: 'Loot', color: 'lime', title: 'Gacha pity, real rates', code: "rng.loot(table, { pity: { epic: 90 } })\nchest.rates() // with pity", text: 'Hard and soft pity, long-run rates for odds disclosure, and balancing simulations.' },
  { tag: 'Chests', color: 'pink', title: 'Full loot chests', code: "{ rolls: [1, 3], drops: {\n  gold: { weight: 50, amount: [10, 50] } } }", text: 'Amounts, several rolls, no repeats, drops only for high-level players, tables inside tables.' },
  { tag: 'Fair', color: 'mint', title: 'Crits without streaks', code: 'const crit = rng.fairChance(0.25)\ncrit.roll()', text: 'The same average with no cruel dry runs. Shuffle bags and card decks are included too.' },
  { tag: 'Worlds', color: 'lemon', title: 'Noise and scatter', code: "createNoise(seed).fbm2d(x, y)\nrng.scatter(1000, 1000, 40)", text: 'Simplex terrain, plus Poisson-disk placement for trees and rocks that never overlap.' },
  { tag: 'Daily', color: 'coral', title: 'Daily challenges', code: "luck.daily({ salt: 'my-game' })", text: 'The same daily level for every player in the world, with time zones and reset hours.' },
]

export const PROOF = [
  ['8', 'runtimes giving identical results'],
  ['490+', 'tests on every release'],
  ['428M', 'numbers per second'],
  ['0', 'dependencies'],
  ['14 KB', 'minified + brotli'],
]

export const FAQ = [
  {
    q: 'What is a seeded random number generator?',
    a: 'A seeded random number generator gives the same sequence of numbers every time you start it from the same seed. Games use one for daily challenges, replays, shareable runs, procedural worlds and multiplayer sync. <code>Math.random()</code> can’t be seeded. With luckbox, <code>luck(\'my-seed\')</code> gives the same results on every device.',
  },
  {
    q: 'How do I make a daily challenge that is the same for every player?',
    a: 'Use <code>luck.daily({ salt: \'my-game\' })</code>. Every player gets the same generator for the same calendar day (UTC by default, or pass a <code>timeZone</code> and <code>resetHour</code>). Its seed, like <code>my-game:daily:2026-11-27</code>, replays any past day.',
  },
  {
    q: 'How do I show gacha drop rates that include pity?',
    a: 'Make the banner with <code>rng.loot(rates, { pity: { star5: 90 }, softPity: { star5: { after: 73, add: 0.06 } } })</code> and call <code>banner.rates()</code>. It works out the exact long-run rates with pity included: for a 0.6% base rate with these settings, about 1.6%.',
  },
  {
    q: 'Is luckbox a replacement for seedrandom?',
    a: 'Yes. <code>import { seedrandom } from \'luckbox/seedrandom\'</code> gives exactly the same numbers as the seedrandom package (checked on 62,600 values), so existing worlds don’t change. For new code, <code>luck()</code> is about 9 times faster and adds dice, loot, pity, forks and more. seedrandom’s last release was in September 2019.',
  },
  {
    q: 'Does luckbox work with Phaser, PixiJS, Three.js or KAPLAY?',
    a: 'Yes. luckbox has no dependencies and works with any engine, in the browser, Node, Bun or Deno, or from a single script tag. The recipes on this site show each engine.',
  },
  {
    q: 'Can I use luckbox for passwords or real-money gambling?',
    a: 'No. Seeded randomness is predictable by design: anyone with the seed can recreate the results. For secrets, use <code>crypto.getRandomValues()</code>.',
  },
]

export const RECIPES = [
  {
    slug: 'phaser',
    engine: 'Phaser',
    color: 'sky',
    title: 'Seeded random in Phaser',
    summary: 'Shareable run seeds, scattered spawns and a loot chest with pity in a Phaser scene.',
    install: 'npm install phaser luckbox',
    lang: 'js',
    code: `import Phaser from 'phaser'
import { luck } from 'luckbox'

class Dungeon extends Phaser.Scene {
  create() {
    // One seed per run: from the URL (?seed=abc) or a fresh one players can share
    const seed = new URLSearchParams(location.search).get('seed') ?? undefined
    this.rng = luck(seed)
    this.add.text(16, 16, \`seed \${this.rng.seed}\`, { color: '#c8ff3c' })

    // Each system gets its own stream, so they never disturb each other
    const spawns = this.rng.fork('spawns')
    for (const { x, y } of spawns.scatter(800, 600, 80)) {
      this.add.circle(x, y, 10, spawns.pick([0xff7cc6, 0x79d6ff, 0xffe25a]))
    }

    // A chest with a guaranteed relic by the 30th open
    this.chest = this.rng.fork('loot').loot(
      { drops: { gold: { weight: 70, amount: '2d6*5' }, potion: 25, relic: 5 } },
      { pity: { relic: 30 } },
    )
    let line = 0
    this.input.on('pointerdown', () => {
      const drops = this.chest.open().map((d) => \`\${d.item} ×\${d.amount}\`).join(', ')
      this.add.text(16, 48 + 22 * (line++ % 24), drops || 'nothing', { color: '#ffffff' })
    })
  }

  save() {
    localStorage.setItem('save', JSON.stringify({ rng: this.rng.state(), chest: this.chest.state() }))
  }
}

new Phaser.Game({ type: Phaser.AUTO, width: 800, height: 600, backgroundColor: '#0e0a1c', scene: Dungeon })`,
    notes: [
      '<code>luck(seed)</code> with no seed picks a fresh one. Show <code>rng.seed</code> so players can share or replay a run.',
      '<code>fork(\'spawns\')</code> and <code>fork(\'loot\')</code> are independent: a change to how spawns use randomness can never change the loot.',
      '<code>chest.state()</code> holds the pity counter, so save it next to <code>rng.state()</code>.',
    ],
  },
  {
    slug: 'pixi',
    engine: 'PixiJS',
    color: 'pink',
    title: 'Seeded random in PixiJS',
    summary: 'A seeded starfield with natural spacing and bell-curve sizes, and a dice roll on every click (PixiJS v8).',
    install: 'npm install pixi.js luckbox',
    lang: 'js',
    code: `import { Application, Graphics, Text } from 'pixi.js'
import { luck } from 'luckbox'

const app = new Application()
await app.init({ width: 800, height: 600, background: '#0e0a1c' })
document.body.appendChild(app.canvas)

const rng = luck('starfield-1')

// Stars spread naturally (never closer than 18px), sizes on a bell curve
const sky = rng.fork('sky')
const stars = new Graphics()
for (const { x, y } of sky.scatter(800, 600, 18)) {
  const size = Math.max(0.5, sky.normal(1.4, 0.5))
  stars.circle(x, y, size).fill({ color: 0xffffff, alpha: sky.range(0.3, 1) })
}
app.stage.addChild(stars)

// Click anywhere to roll a D&D stat: 4d6, keep the highest 3
const dice = rng.fork('dice')
const label = new Text({ text: 'click to roll 4d6kh3', style: { fill: '#c8ff3c', fontSize: 28 } })
label.position.set(24, 24)
app.stage.addChild(label)
app.stage.eventMode = 'static'
app.stage.hitArea = app.screen
app.stage.on('pointertap', () => {
  label.text = dice.dice('4d6kh3').text   // e.g. 4d6kh3 (6, 5, 1 dropped, 3) = 14
})`,
    notes: [
      '<code>scatter()</code> uses Poisson-disk sampling, so stars look natural, not clumped or grid-like.',
      '<code>normal(1.4, 0.5)</code> makes most stars small and a few big, like a real sky.',
      '<code>dice()</code> returns every die and a readable line. Use <code>roll()</code> when you only need the total.',
    ],
  },
  {
    slug: 'three',
    engine: 'Three.js',
    color: 'mint',
    title: 'Seeded terrain in Three.js',
    summary: 'An island from layered noise, with instanced trees scattered on the land. The same seed gives the same island.',
    install: 'npm install three luckbox',
    lang: 'js',
    code: `import * as THREE from 'three'
import { luck } from 'luckbox'
import { createNoise } from 'luckbox/noise'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500)
camera.position.set(0, 60, 90)
camera.lookAt(0, 0, 0)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.5))

const world = luck('island-7')
const noise = createNoise(world.fork('terrain'))
const heightAt = (x, z) => {
  const falloff = 1 - Math.min(1, Math.hypot(x, z) / 50)        // sink the edges into the sea
  return (noise.fbm2d(x / 40, z / 40, { octaves: 5 }) * 0.5 + 0.5) * falloff * 18 - 2
}

// Terrain: a plane with one vertex per noise sample
const ground = new THREE.PlaneGeometry(100, 100, 160, 160)
ground.rotateX(-Math.PI / 2)
const p = ground.attributes.position
for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
ground.computeVertexNormals()
scene.add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ color: 0x7cf7bf, flatShading: true })))

// Trees: Poisson-disk spots, kept only on land, drawn in one instanced mesh
const spots = world.fork('trees').scatter(100, 100, 2.5)
  .map(({ x, y }) => ({ x: x - 50, z: y - 50 }))
  .filter(({ x, z }) => heightAt(x, z) > 1.5)
const trees = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.7, 2.4, 6),
  new THREE.MeshStandardMaterial({ color: 0x1d6b44 }),
  spots.length,
)
const m = new THREE.Matrix4()
spots.forEach(({ x, z }, i) => trees.setMatrixAt(i, m.makeTranslation(x, heightAt(x, z) + 1.2, z)))
scene.add(trees)

renderer.setAnimationLoop(() => renderer.render(scene, camera))`,
    notes: [
      '<code>createNoise(world.fork(\'terrain\'))</code> ties the map to the world seed without moving the world’s own stream.',
      '<code>fbm2d</code> layers noise for big landforms plus small detail. Every value is between −1 and 1.',
      '<code>scatter(100, 100, 2.5)</code> gives tree spots at least 2.5 units apart, so no trees overlap.',
    ],
  },
  {
    slug: 'kaplay',
    engine: 'KAPLAY',
    color: 'lemon',
    title: 'Seeded random in KAPLAY',
    summary: 'Streak-free crits and dice damage on every key press, using luckbox with KAPLAY.',
    install: 'npm install kaplay luckbox',
    lang: 'js',
    code: `import kaplay from 'kaplay'
import { luck } from 'luckbox'

kaplay({ background: [14, 10, 28] })

const rng = luck('arena-run')
const crit = rng.fork('crits').fairChance(0.25)   // 25% crits, never a long dry run
const damage = rng.fork('damage')

add([text('press space to attack', { size: 24 }), pos(24, 24), color(200, 255, 60)])

onKeyPress('space', () => {
  const isCrit = crit.roll()
  const hit = damage.roll('2d6+3') * (isCrit ? 2 : 1)
  add([
    text(isCrit ? \`CRIT \${hit}!\` : String(hit), { size: isCrit ? 56 : 36 }),
    pos(center().x + damage.range(-120, 120), center().y),
    anchor('center'),
    color(isCrit ? rgb(255, 124, 198) : rgb(255, 255, 255)),
    move(UP, 80),
    opacity(1),
    lifespan(0.8, { fade: 0.4 }),
  ])
})`,
    notes: [
      '<code>fairChance(0.25)</code> keeps a 25% crit rate but never lets players miss more than 11 times in a row.',
      'Separate forks for crits and damage keep the crit pattern the same even if you change how damage is rolled.',
      '<code>roll(\'2d6+3\')</code> reads standard dice notation. <code>luck.odds(\'2d6+3\')</code> gives its exact odds.',
    ],
  },
  {
    slug: 'canvas',
    engine: 'Canvas',
    color: 'coral',
    title: 'A daily map in one HTML file',
    summary: 'No build step: one script tag, a daily seed shared by every player, and a noise map drawn on a canvas.',
    install: '<script src="https://cdn.jsdelivr.net/npm/luckbox@1"></script>',
    lang: 'html',
    code: `<!doctype html>
<title>Daily map</title>
<h1 id="title"></h1>
<canvas id="map" width="320" height="200" style="width: 640px; image-rendering: pixelated"></canvas>
<script src="https://cdn.jsdelivr.net/npm/luckbox@1"></script>
<script>
  const { luck, createNoise } = luckbox
  // Every player in the world gets the same map today
  const today = luck.daily({ salt: 'my-map-game' })
  document.getElementById('title').textContent = 'Map for ' + luck.dayKey()

  const noise = createNoise(today.fork('terrain'))
  const ctx = document.getElementById('map').getContext('2d')
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 320; x++) {
      const h = noise.fbm2d(x / 80, y / 80, { octaves: 5 })
      ctx.fillStyle = h > 0.45 ? '#f5f2ff' : h > 0.2 ? '#45be78' : h > 0 ? '#ffe25a' : '#2c5caa'
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // Today's treasure spot
  const spot = today.fork('treasure').pointInRect(320, 200)
  ctx.fillStyle = '#ff7cc6'
  ctx.fillRect(Math.floor(spot.x) - 2, Math.floor(spot.y) - 2, 5, 5)
</script>`,
    notes: [
      'The script tag puts everything, noise included, on <code>window.luckbox</code>. No bundler is needed.',
      '<code>luck.daily()</code> changes at midnight UTC. Pass <code>{ timeZone, resetHour }</code> for local resets.',
      'Players can replay any past day with its seed, like <code>luck(\'my-map-game:daily:2026-11-27\')</code>.',
    ],
  },
]

export const COMPARE = {
  rows: [
    ['Seedable (same results for the same seed)', '✅', '✅', '❌'],
    ['Last release', 'Nov 2026 (maintained)', 'Sep 2019', 'built in'],
    ['Same results on every engine, checked', '✅ Node, Bun, Deno, Chrome, Firefox, WebKit', '–', '❌ not seedable'],
    ['Save and restore', '✅ plain JSON', '✅ with { state: true }', '❌'],
    ['Independent streams (fork)', '✅', '❌', '❌'],
    ['Unbiased whole numbers', '✅ rng.int(min, max)', 'write it yourself', 'write it yourself'],
    ['Dice notation with exact odds', '✅', '❌', '❌'],
    ['Loot tables, pity, real drop rates', '✅', '❌', '❌'],
    ['Shuffle bags, decks, streak-free chance', '✅', '❌', '❌'],
    ['Bell curves, scatter, noise', '✅', '❌', '❌'],
    ['Daily and weekly seeds', '✅', '❌', '❌'],
    ['TypeScript types', '✅ built in', 'via @types/seedrandom', '✅'],
    ['Speed, floats per second (Apple M4, Node 24)', '428 million', '48 million', '266 million'],
    ['Dependencies', '0', '0', '–'],
  ],
}
