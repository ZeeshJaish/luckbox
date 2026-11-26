/*
 * luckbox/names: seeded names for characters, towns, planets and taverns,
 * or names in any style you teach it with a few examples (a Markov chain).
 * The same seed always gives the same names, on every engine.
 */
import { LuckboxError, show } from './errors.ts'

/** The built-in name styles. */
export type NameStyle = 'fantasy' | 'place' | 'planet' | 'tavern'

/** The built-in styles, in a list. */
export const NAME_STYLES: readonly NameStyle[] = ['fantasy', 'place', 'planet', 'tavern']

/** Options for `names()`. */
export interface NamesOptions {
  /** How many letters of context the chain uses. Higher = closer to the examples. Default: 2 (with fewer than 20 examples, falling back to 1 letter where they only ever continue one way). */
  order?: number
  /** Shortest name, in letters. Default: 3, or the shortest example for your own examples. */
  min?: number
  /** Longest name, in letters. Default: 12, or the longest example + 2 for your own examples. */
  max?: number
  /** Allow names that are exactly one of the examples. Default: false (always new names). */
  allowExamples?: boolean
}

/** Anything with `int(min, max)`, like an Rng from `luck()`. */
export interface IntSource {
  int(min: number, max: number): number
}

/** A name generator. Pass it an Rng so the names are seeded. */
export interface Namer {
  /** One name. */
  next(rng: IntSource): string
  /** `count` different names. */
  many(rng: IntSource, count: number): string[]
}

// Invented example names that teach each style its sound.
const FANTASY =
  'Aldric Aelwyn Brannoc Brenna Caelith Corwen Darian Delwyn Elara Elowen Faelan Fenwick Gareth Gwendel Halvard Hesper Isolde Ithran Jorund Kaelen Kestrel Liora Lucan Maelis Merrin Neris Orrin Ostara Pellam Quillon Rhoswen Rowan Seraphine Sorrel Taliesin Theron Ulric Varian Wynne Xandra Yorin Zephyrine Aric Bryndis Calder Dagny Eamon Freya Galen Hildra Ivor Junia Kaelith Lorcan Mirela Nolwen Osric Peregrine Rhiannon Soren Talwyn Ysolde'
const PLACE_START =
  'Ash Black Bracken Briar Cold Copper Dun Dusk East Elm Fair Fox Glen Grey Hollow Hart Iron King Lark Linden Mill Moss North Oak Pine Raven Red Rose Salt Stone Thorn West White Willow Wolf Amber Bramble Cinder Dove Ember Fern Gold Heath Kettle Marrow Nether Old Quarry Tide Wick Frost Silver Storm Wind Hazel Bright Crow Hawk'.split(' ')
const PLACE_END =
  'ford brook mere ridge wood water hill hollow wick stead haven bury moor well vale bridge spur fall grove wold hurst crest hold marsh cliff dale den ham by ton field gate port mouth ley worth reach'.split(' ')
const PLACE_PREFIX = ['Little ', 'Upper ', 'Lower ', 'Great ', 'Old ', 'New ']
const PLANETS =
  'Aethon Altaris Borea Cygnara Draxis Elysia Fenrix Galvora Helion Ixara Jovara Kaltos Kepra Lyrax Morvan Nexis Nyxara Orbis Pyrion Quorra Rhexa Solmyr Tharos Ulnar Vexis Velora Xandor Zephra Zorath Caldera Tesra Myrrhon Kythor Aurelis Brontes Cetara Dynaris Eridon Gorrah Hyperia Ilvara Kronos Luvia Marrok Nebara Ophira Praxis Rygel Sarpedon Tycho Ultara Vandor Wyrrhe Xerxa Ysara Zentha'
const PLANET_SUFFIX = [' Prime', ' II', ' III', ' IV', ' VII', ' Major', ' Minor', '-9', '-12', ' b']
const TAVERN_ADJ =
  'Prancing Drunken Golden Rusty Sleeping Laughing Silver Crooked Wandering Jolly Salty Gilded Howling Lucky Broken Merry Hidden Burning Copper Velvet Thirsty Wicked Frosted Singing Grumpy Brass Twisted Lazy Hungry Sly'.split(' ')
const TAVERN_NOUN =
  'Goat Dragon Anchor Lantern Boar Mermaid Kettle Raven Stag Barrel Fox Tankard Griffin Moon Crown Hound Owl Pike Badger Wyvern Cauldron Horseshoe Toad Bard Rooster Compass Candle Dagger Bear Hare'.split(' ')

const START = '\u0002'
const END = '\u0003'

/** Lowercases A–Z only, so results never depend on an engine's Unicode tables. */
const lower = (text: string): string => text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
/** Capitalises the first letter of each word (a–z only, for the same reason). */
const title = (text: string): string => text.replace(/(^|[\s'-])([a-z])/g, (_, gap: string, c: string) => gap + String.fromCharCode(c.charCodeAt(0) - 32))

function checkRng(rng: unknown): IntSource {
  if (rng === null || typeof rng !== 'object' || typeof (rng as IntSource).int !== 'function') {
    throw new LuckboxError('BAD_ARGUMENT', `names: next(rng) needs an Rng from luck(seed), got ${show(rng)}.`)
  }
  return rng as IntSource
}

function checkCount(count: unknown): number {
  if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 10_000) {
    throw new LuckboxError('BAD_ARGUMENT', `many(rng, count) needs a whole number from 0 to 10,000, got ${show(count)}.`)
  }
  return count as number
}

/** A Markov chain over letters, trained on example names. */
/**
 * `backoff`: where the examples show only one way to continue a context,
 * use a shorter context instead. Small example lists then make new names
 * that still sound like the examples, instead of copying them.
 */
function markov(examples: readonly string[], options: NamesOptions, backoff = false): Namer {
  const { order = 2, min = 3, max = 12, allowExamples = false } = options
  if (!Number.isSafeInteger(order) || order < 1 || order > 6) {
    throw new LuckboxError('BAD_ARGUMENT', `names(): order must be a whole number from 1 to 6, got ${show(order)}.`)
  }
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min || max > 60) {
    throw new LuckboxError('BAD_ARGUMENT', `names(): needs 1 ≤ min ≤ max ≤ 60, got min ${show(min)} and max ${show(max)}.`)
  }
  const known = new Set<string>()
  let triples = false // 'Ulll' only if an example has three of a letter in a row
  // chains[k]: context (the last k letters, joined) → [letter, count] in first-seen order
  const chains: Array<Map<string, Array<[string, number]>>> = []
  const lowest = backoff ? 1 : order
  for (let k = lowest; k <= order; k++) chains[k] = new Map()
  for (const example of examples) {
    const letters = Array.from(lower(example.trim()))
    known.add(letters.join(''))
    for (let i = 2; i < letters.length; i++) if (letters[i] === letters[i - 1] && letters[i] === letters[i - 2]) triples = true
    const seq = [...new Array<string>(order).fill(START), ...letters, END]
    for (let i = order; i < seq.length; i++) {
      const next = seq[i] as string
      for (let k = lowest; k <= order; k++) {
        const chain = chains[k] as Map<string, Array<[string, number]>>
        const context = seq.slice(i - k, i).join('')
        let choices = chain.get(context)
        if (!choices) chain.set(context, (choices = []))
        const found = choices.find((o) => o[0] === next)
        if (found) found[1]++
        else choices.push([next, 1])
      }
    }
  }
  const choicesFor = (context: readonly string[]): Array<[string, number]> => {
    for (let k = order; ; k--) {
      const choices = (chains[k] as Map<string, Array<[string, number]>>).get(context.slice(order - k).join('')) as Array<[string, number]>
      if (k === lowest || choices.length > 1) return choices
    }
  }

  const once = (rng: IntSource): string | undefined => {
    let context = new Array<string>(order).fill(START)
    const out: string[] = []
    for (;;) {
      const choices = choicesFor(context)
      let total = 0
      for (const [, n] of choices) total += n
      let r = rng.int(0, total - 1)
      let next = (choices[choices.length - 1] as [string, number])[0]
      for (const [letter, n] of choices) {
        if (r < n) {
          next = letter
          break
        }
        r -= n
      }
      if (next === END) break
      if (!triples && next === out[out.length - 1] && next === out[out.length - 2]) return undefined
      out.push(next)
      if (out.length > max) return undefined
      context = [...context.slice(1), next]
    }
    const name = out.join('')
    if (out.length < min || (!allowExamples && known.has(name))) return undefined
    return title(name)
  }

  const next = (rng: IntSource): string => {
    checkRng(rng)
    for (let tries = 0; tries < 1000; tries++) {
      const name = once(rng)
      if (name !== undefined) return name
    }
    throw new LuckboxError('BAD_ARGUMENT', 'names(): no new name fits the length limits. Add more examples, widen min and max, or set allowExamples.')
  }

  return {
    next,
    many(rng: IntSource, count: number): string[] {
      checkRng(rng)
      const n = checkCount(count)
      const out = new Set<string>()
      for (let tries = 0; out.size < n; tries++) {
        if (tries > n * 50 + 1000) {
          throw new LuckboxError('BAD_ARGUMENT', `names(): could only make ${out.size} different names of the ${n} asked for. Add more examples.`)
        }
        out.add(next(rng))
      }
      return [...out]
    },
  }
}

/** Many-times-unique picker for generators that build names from parts. */
function fromParts(make: (rng: IntSource) => string, what: string): Namer {
  const next = (rng: IntSource): string => make(checkRng(rng))
  return {
    next,
    many(rng: IntSource, count: number): string[] {
      checkRng(rng)
      const n = checkCount(count)
      const out = new Set<string>()
      for (let tries = 0; out.size < n; tries++) {
        if (tries > n * 50 + 1000) throw new LuckboxError('BAD_ARGUMENT', `names('${what}'): there are not ${n} different ${what} names.`)
        out.add(next(rng))
      }
      return [...out]
    },
  }
}

/** Places join a start and an end, like real ones: Raven + moor, Ash + brook. */
function place(): Namer {
  return fromParts((rng) => {
    const pick = (list: readonly string[]): string => list[rng.int(0, list.length - 1)] as string
    const startWord = pick(PLACE_START)
    let endWord = pick(PLACE_END)
    // Avoid doubled sounds like "Hollowhollow" or "Millley".
    while (startWord.toLowerCase().endsWith(endWord.slice(0, 2)) || startWord.toLowerCase() === endWord) endWord = pick(PLACE_END)
    const name = startWord + endWord
    return rng.int(0, 9) === 0 ? pick(PLACE_PREFIX) + name : name
  }, 'place')
}

function tavern(): Namer {
  return fromParts((rng) => {
    const pick = (list: readonly string[]): string => list[rng.int(0, list.length - 1)] as string
    if (rng.int(0, 9) < 7) return `The ${pick(TAVERN_ADJ)} ${pick(TAVERN_NOUN)}`
    const a = pick(TAVERN_NOUN)
    let b = pick(TAVERN_NOUN)
    while (b === a) b = pick(TAVERN_NOUN)
    return `The ${a} & ${b}`
  }, 'tavern')
}

function planet(options: NamesOptions): Namer {
  const base = markov(PLANETS.split(' '), { order: 2, min: 4, max: 9, ...options })
  const withSuffix = (rng: IntSource, name: string): string =>
    rng.int(0, 9) < 3 ? name + (PLANET_SUFFIX[rng.int(0, PLANET_SUFFIX.length - 1)] as string) : name
  return {
    next: (rng: IntSource): string => withSuffix(rng, base.next(rng)),
    many: (rng: IntSource, count: number): string[] => base.many(rng, count).map((name) => withSuffix(rng, name)),
  }
}

/**
 * A name generator. Use a built-in style, or teach it any style with a list
 * of example names (it learns which letters follow which and makes new ones).
 *
 * @example
 * import { luck } from 'luckbox'
 * import { names } from 'luckbox/names'
 *
 * const rng = luck('my-world')
 * names('fantasy').next(rng)        // a character name
 * names('place').many(rng, 3)       // three town names
 * names('tavern').next(rng)         // 'The Rusty Lantern'
 * names(['Aarav', 'Ishaan', 'Kavya', 'Meera', 'Rohan', 'Saanvi']).next(rng) // in the style of your examples
 */
export function names(source: NameStyle | readonly string[], options: NamesOptions = {}): Namer {
  if (options === null || typeof options !== 'object') {
    throw new LuckboxError('BAD_ARGUMENT', `names(source, options) needs options like { min: 4 }, got ${show(options)}.`)
  }
  if (Array.isArray(source)) {
    const examples = (source as unknown[]).filter((e) => typeof e === 'string' && e.trim().length > 0) as string[]
    if (examples.length !== source.length || examples.length < 3) {
      throw new LuckboxError('BAD_ARGUMENT', `names(examples) needs a list of at least 3 example names (text), got ${show(source)}.`)
    }
    // Unless told otherwise, keep names about as long as the examples.
    const lengths = examples.map((e) => Array.from(e.trim()).length)
    const fitted: NamesOptions = {
      order: 2,
      min: Math.max(2, Math.min(...lengths)),
      max: Math.min(60, Math.max(...lengths) + 2),
      ...options,
    }
    // A short list, unless an order is chosen: back off to one letter where two
    // letters only ever continue one way, so it still makes plenty of new names.
    return markov(examples, fitted, examples.length < 20 && options.order === undefined)
  }
  switch (source) {
    case 'fantasy':
      return markov(FANTASY.split(' '), { order: 2, min: 4, max: 10, ...options })
    case 'place':
      return place()
    case 'planet':
      return planet(options)
    case 'tavern':
      return tavern()
    default:
      throw new LuckboxError(
        'BAD_ARGUMENT',
        `names(): unknown style ${show(source)}. Use ${NAME_STYLES.map((s) => `'${s}'`).join(', ')}, or a list of example names.`,
      )
  }
}
