// Runs the shared fingerprint against the built package in whatever runtime
// runs this file (Node, Bun or Deno) and compares it with Node's results.
import { readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const { luck } = await import(new URL('../../dist/index.js', here).href)
const { createNoise } = await import(new URL('../../dist/noise.js', here).href)
const { seedrandom } = await import(new URL('../../dist/seedrandom.js', here).href)
const { names } = await import(new URL('../../dist/names.js', here).href)
const source = readFileSync(new URL('../browser/fingerprint.js', here), 'utf8')
const fingerprint = new Function(`${source}; return fingerprint`)()
const expected = JSON.parse(readFileSync(new URL('../browser/expected.json', here), 'utf8'))
const got = JSON.parse(JSON.stringify(fingerprint({ luck, createNoise, seedrandom, names })))
const diffs = Object.keys(expected).filter((k) => JSON.stringify(got[k]) !== JSON.stringify(expected[k]))
const runtime =
  typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : typeof Deno !== 'undefined' ? `Deno ${Deno.version.deno}` : `Node ${process.version}`
console.log(diffs.length ? `❌ ${runtime}: different on ${diffs.join(', ')}` : `✅ ${runtime}: identical (${Object.keys(expected).length} checks)`)
if (diffs.length) process.exit(1)
