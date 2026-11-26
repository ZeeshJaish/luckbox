// Renders site/og.png (1200 × 630), the image shown when the site is shared.
// Needs Playwright and an installed Chrome: node site/og.mjs
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Plus+Jakarta+Sans:wght@800&display=swap" rel="stylesheet">
<style>
  body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(900px 500px at 85% -10%, #2a1a5e, transparent 60%), #0e0a1c; color: #f5f2ff; font-family: 'Plus Jakarta Sans'; position: relative; overflow: hidden; }
  .brand { position: absolute; top: 64px; left: 72px; display: flex; align-items: center; gap: 22px; font-size: 52px; font-weight: 800; letter-spacing: -2px; }
  .logo { width: 84px; height: 84px; border-radius: 24px; background: #c8ff3c; display: grid; place-items: center; font-size: 46px; transform: rotate(-8deg); }
  h1 { position: absolute; left: 72px; top: 196px; margin: 0; font-size: 84px; line-height: 1; letter-spacing: -3.5px; width: 720px; }
  em { font-style: normal; color: #c8ff3c; }
  .chips { position: absolute; left: 72px; bottom: 64px; display: flex; gap: 14px; font: 700 24px 'JetBrains Mono'; }
  .chips span { padding: 10px 22px; border-radius: 999px; color: #0e0a1c; }
  .dice { position: absolute; right: 70px; top: 190px; display: grid; grid-template-columns: repeat(2, 120px); gap: 22px; }
  .die { width: 120px; height: 120px; border-radius: 28px; background: #f5f2ff; color: #0e0a1c; display: grid; place-items: center; font-size: 64px; font-weight: 800; box-shadow: 0 10px 0 #c9c2e6; }
  .die.x { background: transparent; color: #6f668f; border: 4px dashed #2e2450; box-shadow: none; text-decoration: line-through; }
</style></head><body>
<div class="brand"><div class="logo">🎲</div>luckbox</div>
<h1>Seeded random for games you can <em>replay</em>.</h1>
<div class="dice"><div class="die">6</div><div class="die">5</div><div class="die x">1</div><div class="die">3</div></div>
<div class="chips"><span style="background:#79d6ff">dice</span><span style="background:#c8ff3c">loot + pity</span><span style="background:#ff7cc6">noise</span><span style="background:#7cf7bf">daily seeds</span></div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.screenshot({ path: fileURLToPath(new URL('./og.png', import.meta.url)) })
await browser.close()
console.log('wrote site/og.png')
