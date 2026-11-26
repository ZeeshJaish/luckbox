// `npx luckbox`: try luckbox from the terminal without writing code.
import { existsSync, readFileSync } from 'node:fs'
import { type DailyOptions, type FullLootSpec, type GachaSpec, type LootOptions, LootTable, LuckboxError, type Rng, VERSION, luck } from './index.ts'
import { NAME_STYLES, type NameStyle, names } from './names.ts'

const HELP = `luckbox ${VERSION}: randomness for games that you can replay

Usage
  npx luckbox roll <dice> [--times N] [--detail] [--seed S]
  npx luckbox odds <dice>
  npx luckbox pick <item> <item> ... [--seed S]
  npx luckbox shuffle <item> <item> ... [--seed S]
  npx luckbox loot <table.json | 'json'> [--open N] [--rates] [--simulate N] [--seed S]
  npx luckbox gacha <banner.json | 'json'> [--pull N] [--disclosure] [--simulate N] [--seed S]
  npx luckbox names [fantasy | place | planet | tavern | a,b,c | names.txt] [--count N] [--seed S]
  npx luckbox daily [--salt NAME] [--tz ZONE] [--reset HOUR] [--date YYYY-MM-DD]
  npx luckbox seed

Examples
  npx luckbox roll 4d6kh3 --times 6          roll a D&D character's stats
  npx luckbox odds 2d6                       exact chance of every total
  npx luckbox loot '{"common":80,"rare":18,"epic":2}' --open 10
  npx luckbox loot banner.json --rates       real drop rates, pity included
  npx luckbox gacha banner.json --pull 10    a 10-pull with the 50/50 and pity
  npx luckbox gacha banner.json --disclosure the odds to publish for players
  npx luckbox names tavern --count 5         five inn names

A loot file is a table ({"common": 80, ...} or {"drops": {...}}), or
{"table": ..., "options": {"pity": {"epic": 90}}} to add pity.
Without --seed a fresh seed is used and printed, so any result can be replayed.
More: https://www.npmjs.com/package/luckbox`

const color = process.stdout.isTTY === true && !process.env.NO_COLOR
const paint = (code: string) => (text: string | number): string => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text))
const bold = paint('1')
const dim = paint('2')
const green = paint('32')
const red = paint('31')
const cyan = paint('36')

class UsageError extends Error {}

interface Args {
  positional: string[]
  flags: Map<string, string | true>
}

function parse(argv: readonly string[]): Args {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s) as [string, string | undefined]
      const next = argv[i + 1]
      if (inline !== undefined) flags.set(name, inline)
      else if (next !== undefined && !next.startsWith('--') && !['detail', 'rates', 'help', 'version', 'disclosure'].includes(name) && !(name === 'simulate' && !/^\d/.test(next))) {
        flags.set(name, next)
        i++
      } else flags.set(name, true)
    } else if (a === '-h') flags.set('help', true)
    else if (a === '-v') flags.set('version', true)
    else positional.push(a)
  }
  return { positional, flags }
}

function text(args: Args, name: string): string | undefined {
  const v = args.flags.get(name)
  if (v === true) throw new UsageError(`--${name} needs a value.`)
  return v
}

function count(args: Args, name: string, fallback: number, max: number): number {
  const v = text(args, name)
  if (v === undefined) return fallback
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new UsageError(`--${name} needs a whole number from 1 to ${max.toLocaleString('en-US')}, got "${v}".`)
  return n
}

/** The Rng for a command, plus a line saying how to replay it. */
function rngFor(args: Args): { rng: Rng; replay: string } {
  const seed = text(args, 'seed')
  const rng = luck(seed)
  return { rng, replay: seed === undefined ? dim(`seed ${rng.seed} · replay with --seed ${rng.seed}`) : dim(`seed ${seed}`) }
}

const percent = (p: number): string => {
  if (p === 0) return '0%'
  if (p === 1) return '100%'
  const v = p * 100
  if (v >= 0.01) return `${v.toFixed(2)}%`
  if (v >= 1e-6) return `${v.toPrecision(3)}%`
  return `${v.toExponential(2)}%`
}

const bar = (p: number, max: number, width = 28): string => {
  const n = max > 0 ? Math.round((p / max) * width) : 0
  return green('█'.repeat(n)) + (n === 0 && p > 0 ? green('▏') : '')
}

function table(rows: string[][], align: Array<'l' | 'r'>): string {
  // Column widths ignore colour codes.
  const visible = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length
  const widths = rows[0]?.map((_, c) => Math.max(...rows.map((r) => visible(r[c] ?? '')))) ?? []
  return rows
    .map((r) =>
      r
        .map((cell, c) => {
          const pad = ' '.repeat((widths[c] ?? 0) - visible(cell))
          return align[c] === 'r' ? pad + cell : cell + pad
        })
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

function roll(args: Args): string {
  const notation = args.positional.join(' ')
  if (!notation) throw new UsageError('roll needs dice, like: npx luckbox roll 2d6+3')
  const { rng, replay } = rngFor(args)
  const times = count(args, 'times', 1, 10_000)
  const lines: string[] = []
  if (args.flags.has('detail') || times === 1) {
    for (let i = 0; i < Math.min(times, 100); i++) {
      const r = rng.dice(notation)
      lines.push(`${r.text.replace(/= (-?\d+)$/, (_, t: string) => `= ${bold(green(t))}`)}`)
    }
  } else {
    const totals = Array.from({ length: times }, () => rng.roll(notation))
    lines.push(totals.map((t) => bold(t)).join('  '))
    if (times > 1) {
      const sum = totals.reduce((a, b) => a + b, 0)
      lines.push(dim(`average ${(sum / times).toFixed(2)} · lowest ${Math.min(...totals)} · highest ${Math.max(...totals)}`))
    }
  }
  return `${lines.join('\n')}\n${replay}`
}

function odds(args: Args): string {
  const notation = args.positional.join(' ')
  if (!notation) throw new UsageError('odds needs dice, like: npx luckbox odds 2d6')
  const o = luck.odds(notation)
  const shown = o.totals.length > 60 ? o.totals.filter((t) => t.chance >= 1e-6) : o.totals
  const max = Math.max(...shown.map((t) => t.chance))
  const rows = [[dim('total'), dim('chance'), dim('this or more'), '']]
  for (const t of shown.slice(0, 80)) rows.push([bold(t.total), percent(t.chance), dim(percent(o.atLeast(t.total))), bar(t.chance, max)])
  const hidden = o.totals.length - Math.min(shown.length, 80)
  return [
    `${bold(notation)}  ${dim(`min ${o.min} · max ${o.max} · average ${o.mean.toFixed(4).replace(/\.?0+$/, '')}`)}`,
    table(rows, ['r', 'r', 'r', 'l']),
    hidden > 0 ? dim(`… ${hidden} rarer totals not shown`) : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function pickOrShuffle(args: Args, shuffle: boolean): string {
  const items = args.positional
  if (items.length === 0) throw new UsageError(`${shuffle ? 'shuffle' : 'pick'} needs some items, like: npx luckbox ${shuffle ? 'shuffle' : 'pick'} sword bow staff`)
  const { rng, replay } = rngFor(args)
  return `${bold(shuffle ? rng.shuffle(items).join(' ') : rng.pick(items))}\n${replay}`
}

function readLoot(source: string): { spec: unknown; options: LootOptions } {
  let json: string
  if (source.trim().startsWith('{')) json = source
  else if (existsSync(source)) json = readFileSync(source, 'utf8')
  else throw new UsageError(`loot needs a JSON file or JSON text. "${source}" is neither.`)
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (e) {
    throw new UsageError(`that loot table is not valid JSON (${e instanceof Error ? e.message : e}).`)
  }
  const wrapped = data as { table?: unknown; options?: LootOptions } | null
  if (wrapped && typeof wrapped === 'object' && 'table' in wrapped) return { spec: wrapped.table, options: wrapped.options ?? {} }
  return { spec: data, options: {} }
}

function loot(args: Args): string {
  const source = args.positional.join(' ')
  if (!source) throw new UsageError(`loot needs a table, like: npx luckbox loot '{"common":80,"rare":20}' --open 5`)
  const { spec, options } = readLoot(source)
  const { rng, replay } = rngFor(args)
  const chest = rng.loot(spec as FullLootSpec, options)
  const out: string[] = []
  const odds = chest.odds() as Record<string, number>
  const isSimple = chest instanceof LootTable
  const rates = isSimple && (args.flags.has('rates') || options.pity || options.softPity) ? (chest as LootTable<string>).rates() : undefined
  const max = Math.max(...Object.values(rates ?? odds))
  const header = [dim('drop'), dim(isSimple ? 'chance' : 'chance per pick')]
  if (rates) header.push(dim('real rate with pity'))
  const rows = [[...header, '']]
  for (const [k, p] of Object.entries(odds)) {
    const row = [bold(k), percent(p)]
    if (rates) row.push(cyan(percent(rates[k] ?? 0)))
    row.push(bar(rates?.[k] ?? p, max, 20))
    rows.push(row)
  }
  out.push(table(rows, rates ? ['l', 'r', 'r', 'l'] : ['l', 'r', 'l']))
  const opens = count(args, 'open', args.flags.has('rates') || args.flags.has('simulate') ? 0 : 1, 10_000)
  if (opens > 0) {
    out.push('')
    const results = Array.from({ length: opens }, () => chest.open())
    const shown = results.map((r) =>
      typeof r === 'string' ? r : r.length === 0 ? dim('nothing') : r.map((d) => (d.amount === 1 ? d.item : `${d.item} ×${d.amount}`)).join(', '),
    )
    out.push(opens <= 30 ? shown.map((s, i) => `${dim(String(i + 1).padStart(2))}  ${bold(s)}`).join('\n') : `${dim(`opened ${opens} times`)}`)
  }
  if (args.flags.has('simulate')) {
    const n = args.flags.get('simulate') === true ? 100_000 : count(args, 'simulate', 100_000, 10_000_000)
    const sim = chest.simulate(n)
    const simRows = [[dim('item'), dim('count'), dim('rate'), dim('longest wait')]]
    for (const [k, s] of Object.entries(sim.drops)) simRows.push([bold(k), s.count.toLocaleString('en-US'), percent(s.rate), `${s.longestWait.toLocaleString('en-US')} opens`])
    out.push('', dim(`simulated ${n.toLocaleString('en-US')} opens on its own fork:`), table(simRows, ['l', 'r', 'r', 'r']))
  }
  out.push(replay)
  return out.join('\n')
}

function readJson(source: string, what: string): unknown {
  let json: string
  if (source.trim().startsWith('{')) json = source
  else if (existsSync(source)) json = readFileSync(source, 'utf8')
  else throw new UsageError(`${what} needs a JSON file or JSON text. "${source}" is neither.`)
  try {
    return JSON.parse(json)
  } catch (e) {
    throw new UsageError(`that ${what} is not valid JSON (${e instanceof Error ? e.message : e}).`)
  }
}

function gacha(args: Args): string {
  const source = args.positional.join(' ')
  if (!source) throw new UsageError(`gacha needs a banner, like: npx luckbox gacha '{"rates":{"star5":6,"star4":51,"star3":943},"pity":{"star5":90}}'`)
  const spec = readJson(source, 'banner') as GachaSpec
  const { rng, replay } = rngFor(args)
  const banner = rng.gacha(spec)
  const out: string[] = []
  const top = banner.rarities[banner.rarities.reduce((best, r, i, all) => ((spec.rates as Record<string, number>)[r] ?? 0) < ((spec.rates as Record<string, number>)[all[best] as string] ?? 0) ? i : best, 0)] as string
  if (args.flags.has('disclosure')) {
    out.push(bold('Odds disclosure'), ...banner.disclosure().rules.map((r) => `• ${r}`), '')
    const rows = [[dim('item'), dim('rarity'), dim('featured'), dim('real rate per pull')]]
    for (const r of banner.itemRates()) rows.push([bold(r.item), r.rarity, r.featured ? cyan('yes') : '', percent(r.rate)])
    out.push(table(rows, ['l', 'l', 'l', 'r']))
  }
  const pulls = count(args, 'pull', args.flags.has('disclosure') || args.flags.has('simulate') ? 0 : 10, 10_000)
  if (pulls > 0) {
    if (out.length) out.push('')
    const results = banner.pullMany(pulls)
    const shown = pulls <= 30 ? results : results.filter((p) => p.rarity === top)
    const rarityWidth = Math.max(...banner.rarities.map((r) => r.length))
    const itemWidth = Math.max(0, ...shown.map((p) => p.item.length + (p.featured ? 2 : 0)))
    for (const p of shown) {
      const name = `${p.item}${p.featured ? ' ★' : ''}`
      const padded = name.padEnd(itemWidth)
      const label = p.rarity === top ? green(bold(padded)) : p.featured ? cyan(padded) : padded
      out.push(`${dim(p.rarity.padEnd(rarityWidth))}  ${label}  ${dim(`pity ${p.pity}`)}`)
    }
    if (pulls > 30) out.push(dim(`${pulls} pulls, showing only ${top} (${shown.length})`))
    const notes = banner.rarities.filter((r) => banner.isGuaranteed(r)).map((r) => `next ${r} is guaranteed featured`)
    if (spec.spark) notes.push(`${banner.sparks} sparks`)
    if (notes.length) out.push(dim(notes.join(' · ')))
  }
  if (args.flags.has('simulate')) {
    const n = args.flags.get('simulate') === true ? 100_000 : count(args, 'simulate', 100_000, 10_000_000)
    const sim = banner.simulate(n)
    const rows = [[dim('rarity'), dim('count'), dim('rate'), dim('featured share'), dim('longest wait')]]
    for (const [r, s2] of Object.entries(sim.rarities)) rows.push([bold(r), s2.count.toLocaleString('en-US'), percent(s2.rate), percent(sim.featuredShare[r] ?? 0), `${s2.longestWait.toLocaleString('en-US')} pulls`])
    out.push('', dim(`simulated ${n.toLocaleString('en-US')} pulls on its own fork:`), table(rows, ['l', 'r', 'r', 'r', 'r']))
  }
  if (pulls > 0 || args.flags.has('simulate')) out.push(replay) // the disclosure alone uses no randomness
  return out.join('\n')
}

function nameCommand(args: Args): string {
  const source = args.positional.join(' ') || 'fantasy'
  let generator
  if ((NAME_STYLES as readonly string[]).includes(source)) generator = names(source as NameStyle)
  else if (existsSync(source)) generator = names(readFileSync(source, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
  else if (source.includes(',')) generator = names(source.split(',').map((e) => e.trim()).filter(Boolean))
  else throw new UsageError(`names needs a style (${NAME_STYLES.join(', ')}), example names separated by commas, or a file with one name per line.`)
  const { rng, replay } = rngFor(args)
  return `${generator.many(rng, count(args, 'count', 10, 1000)).map((n) => bold(n)).join('\n')}\n${replay}`
}

function daily(args: Args): string {
  const options: DailyOptions = {}
  const salt = text(args, 'salt')
  const timeZone = text(args, 'tz')
  const reset = text(args, 'reset')
  const date = text(args, 'date')
  if (salt !== undefined) options.salt = salt
  if (timeZone !== undefined) options.timeZone = timeZone
  if (reset !== undefined) options.resetHour = Number(reset)
  if (date !== undefined) options.date = date
  const day = luck.daily(options)
  const week = luck.weekly(options)
  return [
    `${dim('today    ')}  ${bold(luck.dayKey(options).padEnd(10))}   ${dim('seed')} ${cyan(String(day.seed))}`,
    `${dim('this week')}  ${bold(luck.weekKey(options).padEnd(10))}   ${dim('seed')} ${cyan(String(week.seed))}`,
    dim(`every player gets the same results from luck('${day.seed}')`),
  ].join('\n')
}

function main(argv: readonly string[]): number {
  const args = parse(argv)
  const command = args.positional.shift()
  if (args.flags.has('version')) {
    console.log(VERSION)
    return 0
  }
  if (!command || args.flags.has('help') || command === 'help') {
    console.log(HELP)
    return command || args.flags.has('help') ? 0 : 2
  }
  try {
    const commands: Record<string, (a: Args) => string> = {
      roll,
      odds,
      pick: (a) => pickOrShuffle(a, false),
      shuffle: (a) => pickOrShuffle(a, true),
      loot,
      gacha,
      names: nameCommand,
      daily,
      seed: () => bold(String(luck().seed)),
    }
    const run = commands[command]
    if (!run) throw new UsageError(`unknown command "${command}". Try: roll, odds, pick, shuffle, loot, gacha, names, daily or seed.`)
    console.log(run(args))
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${red('luckbox:')} ${error.message}\n${dim('npx luckbox --help for examples')}`)
      return 2
    }
    if (error instanceof LuckboxError) {
      console.error(red(error.message))
      return 1
    }
    throw error
  }
}

process.exitCode = main(process.argv.slice(2))
