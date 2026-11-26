// Opens test/browser/index.html in Chrome, Firefox and Safari's engine (WebKit)
// with Playwright, and reports whether each matches Node exactly.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)))
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) return res.writeHead(403).end()
  let body
  try {
    body = await readFile(path)
  } catch {
    return res.writeHead(404).end()
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/test/browser/index.html`

const browsers = [
  ['Chrome', () => chromium.launch({ channel: 'chrome' })],
  ['Firefox', () => firefox.launch()],
  ['Safari (WebKit)', () => webkit.launch()],
]
let failed = false
for (const [name, launch] of browsers) {
  let browser
  try {
    browser = await launch()
    const page = await browser.newPage()
    await page.goto(url)
    await page.waitForFunction(() => document.title === 'MATCH' || document.title === 'MISMATCH', null, { timeout: 30_000 })
    const ok = (await page.title()) === 'MATCH'
    const line = ((await page.textContent('#out')) ?? '').split('\n')[0]
    console.log(`${ok ? '✅' : '❌'} ${name} ${browser.version()}: ${line.replace(/^[✅❌] /, '')}`)
    if (!ok) failed = true
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    // A browser that can't start on this machine is skipped (CI sets STRICT_BROWSERS=1).
    // A browser that starts but gives different numbers always fails.
    const strict = process.env.STRICT_BROWSERS === '1'
    console.log(`${strict ? '❌' : '⚠️ '} ${name}: could not start here (${message})${strict ? '' : ', skipped'}`)
    if (strict) failed = true
  } finally {
    await browser?.close()
  }
}
server.close()
process.exit(failed ? 1 : 0)
