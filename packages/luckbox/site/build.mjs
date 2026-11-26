// Builds the luckbox site into site/out/ with no dependencies.
// Usage: SITE_URL=https://example.com/luckbox/ node site/build.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPARE, FAQ, FEATURES, PROMPT, PROOF, QUICKSTART, RECIPES, SITE } from './content.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, '..')
const out = join(here, 'out')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const BASE = (process.env.SITE_URL ?? 'https://zeeshjaish.github.io/luckbox/').replace(/\/?$/, '/')
const NPM = 'https://www.npmjs.com/package/luckbox'
const REPO = process.env.REPO_URL ?? ''

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---------------------------------------------------------------- tiny syntax highlighter
const JS_TOKENS =
  /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(<\/?[a-zA-Z][a-zA-Z0-9-]*|\/?>)|\b(import|from|export|const|let|var|new|for|of|in|if|else|return|await|async|class|extends|this|function|true|false|undefined|null|while)\b|\b(\d[\d_.]*(?:e-?\d+)?)\b/g
function highlight(code) {
  let html = ''
  let last = 0
  for (const m of code.matchAll(JS_TOKENS)) {
    html += esc(code.slice(last, m.index))
    const [text, comment, string, tag, keyword, number] = m
    const cls = comment ? 'c' : string ? 's' : tag ? 't' : keyword ? 'k' : number ? 'n' : ''
    html += `<span class="${cls}">${esc(text)}</span>`
    last = m.index + text.length
  }
  return html + esc(code.slice(last))
}
const codeBlock = (code, label = '', { plain = false } = {}) =>
  `<div class="codebox">${label ? `<div class="codebar"><span>${esc(label)}</span><button class="copy" data-copy="${esc(code)}">copy</button></div>` : `<button class="copy floating" data-copy="${esc(code)}">copy</button>`}<pre><code>${plain ? esc(code) : highlight(code)}</code></pre></div>`

// ---------------------------------------------------------------- layout
function page({ path, title, description, body, jsonLd = [], rel = '' }) {
  const url = BASE + path.replace(/index\.html$/, '')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="luckbox">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0e0a1c">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%23c8ff3c'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle'%3E🎲%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${rel}style.css">
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<header class="nav">
  <a class="brand" href="${rel}index.html"><span class="logo">🎲</span>luckbox<span class="ver">v${pkg.version}</span></a>
  <nav>
    <a href="${rel}playground/index.html">Playground</a>
    <a href="${rel}recipes/index.html">Recipes</a>
    <a href="${rel}compare.html">Compare</a>
    <a href="${NPM}">npm</a>${REPO ? `\n    <a href="${REPO}">GitHub</a>` : ''}
  </nav>
</header>
<main>
${body}
</main>
<footer>
  <span>luckbox · part of the Zedbury Game Kit · MIT licence</span>
  <span><a href="${NPM}">npm</a> · <a href="${rel}llms.txt">llms.txt</a> · <a href="https://unpkg.com/luckbox/AGENTS.md">AGENTS.md</a></span>
</footer>
<script>
  for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.copy)
    const t = b.textContent; b.textContent = 'copied'; setTimeout(() => (b.textContent = t), 1200)
  })
</script>
</body>
</html>
`
}

const softwareLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'luckbox',
  description: SITE.description,
  url: BASE,
  codeRepository: REPO || NPM,
  programmingLanguage: ['JavaScript', 'TypeScript'],
  runtimePlatform: ['Browser', 'Node.js', 'Bun', 'Deno'],
  license: 'https://opensource.org/licenses/MIT',
  version: pkg.version,
  keywords: pkg.keywords.join(', '),
  author: { '@type': 'Organization', name: 'Zedbury Studios' },
}

// ---------------------------------------------------------------- pages
const recipeCards = (rel) =>
  RECIPES.map(
    (r) => `<a class="recipe-card" href="${rel}recipes/${r.slug}.html"><span class="tag ${r.color}">${esc(r.engine)}</span><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><span class="more">Read the recipe →</span></a>`,
  ).join('\n')

const promptBox = `<section class="prompt">
  <div>
    <span class="tag lime">For AI-built games</span>
    <h2>Building with Claude, ChatGPT or Cursor?</h2>
    <p>Paste this into your AI assistant. luckbox also ships an <a href="https://unpkg.com/luckbox/AGENTS.md">AGENTS.md</a> that coding agents read from <code>node_modules</code>.</p>
  </div>
  ${codeBlock(PROMPT, 'prompt', { plain: true })}
</section>`

const index = page({
  path: 'index.html',
  title: 'luckbox: seeded random for JavaScript games (dice, loot, pity, noise)',
  description: SITE.description,
  jsonLd: [
    softwareLd,
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') } })) },
  ],
  body: `
<section class="hero">
  <h1>Seeded random for games, that you can <em>replay</em>.</h1>
  <p class="lede">luckbox gives every player the same results from the same seed, on every device, in every version. Dice with exact odds, loot tables with gacha pity, shuffle bags, noise worlds and daily challenges are built in.</p>
  <div class="cta">
    <div class="install"><code>npm install luckbox</code><button class="copy" data-copy="npm install luckbox">copy</button></div>
    <a class="pill lime" href="playground/index.html">Try the playground</a>
    <a class="pill ghost" href="${NPM}">Docs on npm</a>
  </div>
</section>

${codeBlock(QUICKSTART, 'quick start')}

<section class="proof">
${PROOF.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('\n')}
</section>

<section>
  <h2 class="section-title">What's in the box</h2>
  <div class="features">
${FEATURES.map((f) => `<article class="feature"><span class="tag ${f.color}">${esc(f.tag)}</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p><pre><code>${highlight(f.code)}</code></pre></article>`).join('\n')}
  </div>
</section>

<section>
  <h2 class="section-title">Recipes for your engine</h2>
  <div class="recipes">${recipeCards('')}</div>
</section>

${promptBox}

<section class="faq">
  <h2 class="section-title">Questions</h2>
${FAQ.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${f.a}</p></details>`).join('\n')}
</section>
`,
})

const recipesIndex = page({
  path: 'recipes/index.html',
  rel: '../',
  title: 'luckbox recipes: seeded random in Phaser, PixiJS, Three.js, KAPLAY and canvas',
  description: 'Copy-paste recipes for seeded randomness in popular JavaScript game engines: run seeds, loot with pity, dice, scatter and noise terrain.',
  jsonLd: [softwareLd],
  body: `<section class="hero small"><h1>Recipes</h1><p class="lede">Working code for each engine. Every recipe uses the same luckbox API, so what you learn carries over.</p></section>
<div class="recipes">${recipeCards('../')}</div>
${promptBox}`,
})

const recipePages = RECIPES.map((r) =>
  page({
    path: `recipes/${r.slug}.html`,
    rel: '../',
    title: `${r.title} with luckbox`,
    description: `${r.summary} Copy-paste ${r.engine} code using the luckbox seeded random library.`,
    jsonLd: [
      softwareLd,
      { '@context': 'https://schema.org', '@type': 'TechArticle', headline: `${r.title} with luckbox`, description: r.summary, about: [r.engine, 'seeded random number generator', 'game development'], author: { '@type': 'Organization', name: 'Zedbury Studios' } },
    ],
    body: `<section class="hero small">
  <span class="tag ${r.color}">${esc(r.engine)}</span>
  <h1>${esc(r.title)}</h1>
  <p class="lede">${esc(r.summary)}</p>
</section>
<h2 class="section-title">Install</h2>
${codeBlock(r.install, r.lang === 'html' ? 'script tag' : 'terminal')}
<h2 class="section-title">The code</h2>
${codeBlock(r.code, r.lang === 'html' ? 'index.html' : 'main.js')}
<h2 class="section-title">What's going on</h2>
<ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
<h2 class="section-title">More recipes</h2>
<div class="recipes">${recipeCards('../').split('\n').filter((c) => !c.includes(`recipes/${r.slug}.html`)).join('\n')}</div>
${promptBox}`,
  }),
)

const compare = page({
  path: 'compare.html',
  title: 'luckbox vs seedrandom vs Math.random: seeded random for JavaScript',
  description: 'A side-by-side comparison of luckbox, the seedrandom package and Math.random for games: seeding, saving, streams, dice, loot, pity, speed and maintenance.',
  jsonLd: [softwareLd],
  body: `<section class="hero small">
  <h1>luckbox vs seedrandom vs <code>Math.random</code></h1>
  <p class="lede">seedrandom has been the standard seeded random package for years, and millions of projects still install it every week. Its last release was in September 2019. Here's how the three compare for games.</p>
</section>
<div class="table-wrap"><table class="compare">
  <thead><tr><th></th><th>luckbox</th><th>seedrandom</th><th>Math.random</th></tr></thead>
  <tbody>${COMPARE.rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody>
</table></div>
<h2 class="section-title">Switch without changing a single number</h2>
<p class="body">Existing worlds made with seedrandom keep every number with <code>luckbox/seedrandom</code>. It's checked against the real package on 62,600 values.</p>
${codeBlock(`// before: import seedrandom from 'seedrandom'\nimport { seedrandom } from 'luckbox/seedrandom'\n\nconst rng = seedrandom('hello.')\nrng() // 0.9282578795792454, exactly like seedrandom`, 'migrate.js')}
<p class="body">The full guide is at <a href="https://unpkg.com/luckbox/docs/migrating-from-seedrandom.md">docs/migrating-from-seedrandom.md</a>. Speed was measured with <code>npm run bench</code>, each generator in its own process.</p>`,
})

// ---------------------------------------------------------------- write everything
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'recipes'), { recursive: true })
mkdirSync(join(out, 'playground'), { recursive: true })
writeFileSync(join(out, 'style.css'), readFileSync(join(here, 'style.css'), 'utf8'))
writeFileSync(join(out, 'index.html'), index)
writeFileSync(join(out, 'recipes/index.html'), recipesIndex)
RECIPES.forEach((r, i) => writeFileSync(join(out, `recipes/${r.slug}.html`), recipePages[i]))
writeFileSync(join(out, 'compare.html'), compare)

// The playground loads the published package from the CDN on the live site.
const playground = readFileSync(join(pkgDir, 'playground/index.html'), 'utf8').replace(
  "local.src = '../dist/luckbox.min.js'",
  "local.src = 'https://cdn.jsdelivr.net/npm/luckbox@0/dist/luckbox.min.js'",
)
writeFileSync(join(out, 'playground/index.html'), playground)

// llms.txt points at the live site; llms-full.txt is everything an AI needs in one file.
const llms = readFileSync(join(pkgDir, 'llms.txt'), 'utf8').replace(
  '## Docs\n',
  `## Docs\n\n- [Website](${BASE}): overview, FAQ and engine recipes\n- [Recipes](${BASE}recipes/index.html): Phaser, PixiJS, Three.js, KAPLAY and plain canvas\n- [Playground](${BASE}playground/index.html): try it in the browser\n- [Compare](${BASE}compare.html): luckbox vs seedrandom vs Math.random\n`,
)
writeFileSync(join(out, 'llms.txt'), llms)
const recipesText = RECIPES.map((r) => `## Recipe: ${r.title}\n\n${r.summary}\n\nInstall: ${r.install}\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\``).join('\n\n')
writeFileSync(
  join(out, 'llms-full.txt'),
  `${readFileSync(join(pkgDir, 'AGENTS.md'), 'utf8')}\n\n---\n\n${readFileSync(join(pkgDir, 'README.md'), 'utf8')}\n\n---\n\n${recipesText}\n`,
)
const pages = ['', 'recipes/index.html', ...RECIPES.map((r) => `recipes/${r.slug}.html`), 'compare.html', 'playground/index.html']
const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${BASE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
)
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`)
cpSync(join(here, 'og.png'), join(out, 'og.png'), { force: true })
console.log(`built ${pages.length} pages + llms.txt, llms-full.txt, sitemap.xml, robots.txt → site/out (${BASE})`)
