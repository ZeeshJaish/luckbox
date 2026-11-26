// Speed of luckbox against Math.random and the seedrandom package.
// Each row runs in its own process, so the JavaScript engine's optimiser
// treats every generator fairly. Run after a build: npm run bench
import { spawnSync } from 'node:child_process'
import { cpus } from 'node:os'

const ROWS = {
  'Math.random() (not seedable)': `const f = () => Math.random()`,
  'luckbox rng.float() (sfc32, default)': `const r = luck('b'); const f = () => r.float()`,
  'luckbox rng.float() (xoshiro128**)': `const r = luck('b', { algorithm: 'xoshiro128**' }); const f = () => r.float()`,
  'luckbox rng.float() (mulberry32)': `const r = luck('b', { algorithm: 'mulberry32' }); const f = () => r.float()`,
  'seedrandom rng() (the package)': `const r = seedrandomPkg('b'); const f = () => r()`,
  'luckbox/seedrandom rng() (same numbers)': `const r = seedrandom('b'); const f = () => r()`,
  'luckbox rng.int(1, 6)': `const r = luck('b'); const f = () => r.int(1, 6)`,
  'luckbox rng.roll("2d6")': `const r = luck('b'); const f = () => r.roll('2d6')`,
  'luckbox rng.roll("4d6kh3")': `const r = luck('b'); const f = () => r.roll('4d6kh3')`,
  'luckbox loot table open()': `const c = luck('b').loot({ common: 80, rare: 18, epic: 2 }); const f = () => c.open().length`,
  'luckbox rng.normal()': `const r = luck('b'); const f = () => r.normal()`,
}

const body = (setup) => `
import seedrandomPkg from 'seedrandom'
import { luck } from './dist/index.js'
import { seedrandom } from './dist/seedrandom.js'
${setup}
let sink = 0
for (let i = 0; i < 300000; i++) sink += +f()
let ops = 0; const start = performance.now(); let elapsed = 0
while (elapsed < 700) { for (let i = 0; i < 100000; i++) sink += +f(); ops += 100000; elapsed = performance.now() - start }
console.log(JSON.stringify({ perSecond: (ops / elapsed) * 1000, sink: sink > 0 }))
`

if (process.argv[2] !== '--quiet') console.log(`Node ${process.version} on ${cpus()[0]?.model ?? 'unknown CPU'}\n`)
console.log('| | Millions per second |\n|---|---|')
for (const [name, setup] of Object.entries(ROWS)) {
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', body(setup)], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  const { perSecond } = JSON.parse(out.stdout.trim().split('\n').pop() ?? '{}')
  console.log(`| ${name} | ${(perSecond / 1e6).toFixed(1)} |`)
}
