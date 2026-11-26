import { describe, expect, it } from 'vitest'
import { luck } from '../src/index.ts'
import { NAME_STYLES, names } from '../src/names.ts'
import { expectCode } from './helpers.ts'

describe('luckbox/names', () => {
  it.each(NAME_STYLES)('%s: makes capitalised names the same way every time', (style) => {
    const a = names(style).many(luck(`n:${style}`), 50)
    const b = names(style).many(luck(`n:${style}`), 50)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(50)
    for (const name of a) expect(name).toMatch(/^[A-Z]/)
  })

  it('fantasy and place names stay within their lengths and use only letters', () => {
    const rng = luck('lengths')
    for (const name of names('fantasy').many(rng, 300)) expect(name).toMatch(/^[A-Z][a-z]{3,9}$/)
    for (const name of names('place').many(rng, 300)) expect(name).toMatch(/^((Little|Upper|Lower|Great|Old|New) )?[A-Z][a-z]{4,13}$/)
  })

  it('makes new names, not copies of the examples', () => {
    const examples = ['Haruto', 'Yuto', 'Sota', 'Yuki', 'Hinata', 'Riku', 'Kaito', 'Ren', 'Aoi', 'Yui', 'Hana', 'Sakura', 'Rin', 'Mio', 'Akari', 'Kenji']
    const made = names(examples).many(luck('new'), 30)
    for (const name of made) expect(examples).not.toContain(name)
    const same = names(examples, { allowExamples: true, order: 4 }).many(luck('copy'), 6)
    expect(same.some((n) => examples.includes(n))).toBe(true)
  })

  it('learns your style and keeps the length near your examples', () => {
    const examples = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Saanvi', 'Ananya', 'Diya', 'Aadhya', 'Kavya', 'Meera']
    for (const name of names(examples).many(luck('style'), 60)) {
      expect(name.length).toBeGreaterThanOrEqual(4)
      expect(name.length).toBeLessThanOrEqual(9)
    }
    for (const name of names(examples, { min: 3, max: 5 }).many(luck('short'), 20)) expect(name.length).toBeLessThanOrEqual(5)
  })

  it('a short list still makes plenty of new names, with no triple letters unless the examples have them', () => {
    const orcs = ['Grukk', 'Thrag', 'Morgul', 'Zug', 'Brakka', 'Gorbag', 'Urzog', 'Krull']
    const made = names(orcs).many(luck('orcs'), 40)
    expect(made).toHaveLength(40)
    for (const name of made) {
      expect(orcs).not.toContain(name)
      expect(name.toLowerCase()).not.toMatch(/(.)\1\1/)
    }
    const shouty = names(['Aaargh', 'Baaah', 'Graaah', 'Waaagh'], { min: 3 }).many(luck('shout'), 6)
    expect(shouty.some((n) => /aaa/i.test(n))).toBe(true)
  })

  it('handles accents and other scripts as whole letters', () => {
    const made = names(['Zoë', 'Chloé', 'Inès', 'Léa', 'Anaïs', 'Maëlle', 'Noémie', 'Héloïse'], { min: 2 }).many(luck('accents'), 5)
    for (const name of made) expect(name.normalize('NFC')).toBe(name)
    const hindi = names(['आरव', 'विवान', 'आदित्य', 'अर्जुन', 'ईशान', 'अनन्या', 'दिया', 'काव्या'], { min: 2 }).next(luck('hindi'))
    expect(hindi.length).toBeGreaterThan(1)
  })

  it('planets sometimes get a designation; taverns follow their patterns', () => {
    const planets = names('planet').many(luck('p'), 200)
    expect(planets.some((p) => / (Prime|II|III|IV|VII|Major|Minor|b)$|-\d+$/.test(p))).toBe(true)
    for (const t of names('tavern').many(luck('t'), 100)) expect(t).toMatch(/^The [A-Z][a-z]+( & [A-Z][a-z]+| [A-Z][a-z]+)$/)
  })

  it('works with any object that has int(min, max)', () => {
    let n = 0
    const fake = { int: (min: number, max: number): number => min + (n++ % (max - min + 1)) }
    expect(typeof names('fantasy').next(fake)).toBe('string')
  })

  it('explains mistakes', () => {
    expectCode(() => names('elvish' as 'fantasy'), 'BAD_ARGUMENT')
    expectCode(() => names(['a', 'b']), 'BAD_ARGUMENT')
    expectCode(() => names(['ok', 'fine', '']), 'BAD_ARGUMENT')
    expectCode(() => names(['ok', 'fine', 5 as unknown as string]), 'BAD_ARGUMENT')
    expectCode(() => names('fantasy', 'x' as never), 'BAD_ARGUMENT')
    expectCode(() => names(['abc', 'abd', 'abe'], { order: 0 }), 'BAD_ARGUMENT')
    expectCode(() => names(['abc', 'abd', 'abe'], { min: 5, max: 2 }), 'BAD_ARGUMENT')
    expectCode(() => names('fantasy').next(null as never), 'BAD_ARGUMENT')
    expectCode(() => names('fantasy').many(luck('x'), -1), 'BAD_ARGUMENT')
    expectCode(() => names('tavern').many({} as never, 1), 'BAD_ARGUMENT')
    // Only three possible names, and none may copy an example: asking for more must explain, not hang.
    expectCode(() => names(['ab', 'ab', 'ab'], { min: 1, max: 2 }).next(luck('x')), 'BAD_ARGUMENT')
    expectCode(() => names(['abc', 'abd', 'abe'], { allowExamples: true }).many(luck('x'), 50), 'BAD_ARGUMENT')
    expectCode(() => names('tavern').many(luck('x'), 5_000), 'BAD_ARGUMENT')
    expectCode(() => names('place').many(luck('x'), 10_001), 'BAD_ARGUMENT') // over the 10,000 limit
  })
})
