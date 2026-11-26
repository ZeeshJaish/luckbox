// Same results everywhere: Node, Bun, Deno, Chrome, Firefox and Safari (WebKit).
// Bun and Deno are optional: install them in tools/runtimes to include them.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', cwd: fileURLToPath(new URL('../..', import.meta.url)) }).status ?? 1
/** Bun or Deno from tools/runtimes, or from PATH (as in CI). */
const find = (name) => {
  const local = fileURLToPath(new URL(`../../../../tools/runtimes/node_modules/.bin/${name}`, import.meta.url))
  if (existsSync(local)) return local
  return spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0 ? name : undefined
}
let failures = 0
failures += run('node', ['test/browser/make-expected.cjs']) === 0 ? 0 : 1
failures += run('node', ['test/cross/check-runtime.mjs'])
for (const [name, args] of [['bun', ['test/cross/check-runtime.mjs']], ['deno', ['run', '--allow-read', 'test/cross/check-runtime.mjs']]]) {
  const cmd = find(name)
  if (cmd) failures += run(cmd, args)
  else if (process.env.STRICT_BROWSERS === '1') {
    console.log(`❌ ${name} is not installed`)
    failures++
  } else console.log(`(skipped ${name}: not installed)`)
}
failures += run('node', ['test/cross/browsers.mjs'])
process.exit(failures ? 1 : 0)
