// Same results everywhere: Node, Bun, Deno, Chrome, Firefox and Safari (WebKit).
// Bun and Deno are optional: install them in tools/runtimes to include them.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', cwd: fileURLToPath(new URL('../..', import.meta.url)) }).status ?? 1
const bin = (name) => fileURLToPath(new URL(`../../../../tools/runtimes/node_modules/.bin/${name}`, import.meta.url))
let failures = 0
failures += run('node', ['test/browser/make-expected.cjs']) === 0 ? 0 : 1
failures += run('node', ['test/cross/check-runtime.mjs'])
for (const [name, args] of [['bun', ['test/cross/check-runtime.mjs']], ['deno', ['run', '--allow-read', 'test/cross/check-runtime.mjs']]]) {
  if (existsSync(bin(name))) failures += run(bin(name), args)
  else console.log(`(skipped ${name}: not installed in tools/runtimes)`)
}
failures += run('node', ['test/cross/browsers.mjs'])
process.exit(failures ? 1 : 0)
