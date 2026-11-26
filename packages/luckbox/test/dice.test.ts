import { describe, expect, it } from 'vitest'
import { luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const close = (a: number, b: number, digits = 12): void => {
  expect(Math.abs(a - b)).toBeLessThan(10 ** -digits)
}

describe('dice notation: what is accepted', () => {
  it.each([
    '2d6', 'd20', 'D20+5', ' 2d6 + 3 ', '4d6kh3', '4d6k3', '2d20kh', '2d20kl1', '4d6dl1', '4d6dh1', '3d6!', '2d6r1',
    '2d6r<2', '2d6ro1', '2d6ro<2', 'd%', '4dF', '4df', '5d4*10', '5d4x10', '5d4×10', '1d8+1d6-2', '-1d4', '+3', '7',
    '3*2', '2d6!r1kh1', '10d10−2', '1d1', '1000d6', 'd1000000', '1d6 * 2',
  ])('%s', (notation) => {
    expect(() => luck('p').roll(notation)).not.toThrow()
  })
})

describe('dice notation: mistakes are explained', () => {
  it.each([
    ['', 'is empty'],
    ['   ', 'is empty'],
    ['2d', 'needs a number of sides'],
    ['0d6', 'at least 1 die'],
    ['d0', 'at least 1 side'],
    ['2y6', 'unexpected "y"'],
    ['*2', 'unexpected "*" at the start'],
    ['2d6+', 'ends after "+"'],
    ['2d6++3', 'unexpected "+"'],
    ['2d6 3', 'there is a space between "6" and "3"'],
    ['2d6d6', 'unexpected "d"'],
    ['4d6kh5', "can't keep 5 of 4 dice"],
    ['4d6kh0', "can't keep 0 of 4 dice"],
    ['4d6dl4', "can't drop 4 of 4 dice"],
    ['4d6kh3kl1', 'only one keep or drop'],
    ['d1!', 'explode forever'],
    ['4dF!', 'cannot explode'],
    ['3d6!!', '"!" only once'],
    ['d6r7', 'r7 can never happen on a d6'],
    ['d6r0', 'r0 can never happen'],
    ['d6r<6', 'rerolls every face of a d6'],
    ['d6r', 'needs a face to reroll'],
    ['d6r1r2', 'only one reroll'],
    ['4dFr1', 'cannot be rerolled'],
    ['2d6*', 'needs a whole number after it'],
    ['2d6*0', 'multiply by a whole number'],
    ['1001d6', 'too many for one group'],
    ['d1000001', 'too many sides'],
    ['1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1d6', 'more than the limit'],
    ['1d6+'.repeat(130), 'longer than 500'],
    ['99999999999999999999d6', 'is too big'],
    ['2000000000', 'is too big'],
  ])('%s', (notation, message) => {
    expectCode(() => luck('p').roll(notation), 'BAD_DICE')
    expect(() => luck('p').roll(notation)).toThrow(message)
  })

  it('rejects things that are not text', () => {
    expectCode(() => luck('p').roll(6 as unknown as string), 'BAD_DICE')
    expectCode(() => luck.odds(undefined as unknown as string), 'BAD_DICE')
  })
})

describe('roll()', () => {
  const rolls = (notation: string, n = 3_000): number[] => {
    const rng = luck(`roll:${notation}`)
    return Array.from({ length: n }, () => rng.roll(notation))
  }

  it('2d6 gives every total from 2 to 12', () => {
    expect([...new Set(rolls('2d6'))].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it.each([
    ['d20+5', 6, 25],
    ['d%', 1, 100],
    ['4dF', -4, 4],
    ['1d8+1d6-2', 0, 12],
    ['-1d4', -4, -1],
    ['4d6kh3', 3, 18],
    ['2d20kl1', 1, 20],
  ])('%s stays from %i to %i', (notation, min, max) => {
    for (const r of rolls(notation)) {
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(min)
      expect(r).toBeLessThanOrEqual(max)
    }
  })

  it('multiplies with *', () => {
    for (const r of rolls('5d4*10')) {
      expect(r % 10).toBe(0)
      expect(r >= 50 && r <= 200).toBe(true)
    }
    expect(luck('x').roll('3*2')).toBe(6)
    expect(luck('x').roll('2x6')).toBe(12) // x means times, like 5d4x10
  })

  it('plain numbers draw nothing', () => {
    const rng = luck('x')
    expect(rng.roll('7')).toBe(7)
    expect(rng.roll('-0')).toBe(0)
    expect(Object.is(rng.roll('-0'), -0)).toBe(false)
    expect(rng.draws).toBe(0)
  })

  it('exploding dice never total exactly 6 or 12 on a d6!', () => {
    const all = rolls('1d6!', 20_000)
    expect(all).not.toContain(6)
    expect(all).not.toContain(12)
    expect(Math.max(...all)).toBeGreaterThan(6)
  })

  it('rerolls remove the rerolled faces', () => {
    expect(rolls('1d6r1')).not.toContain(1)
    const low = rolls('1d6r<2')
    expect(low).not.toContain(1)
    expect(low).not.toContain(2)
  })

  it('gives the same totals as dice() from the same position', () => {
    const notations = ['2d6+3', '4d6kh3', '3d6!', '2d6r1', '2d6ro<2', '4dF', '5d4*10-1d6', '2d20kl1', '3d6!r1dl1']
    const a = luck('same')
    const b = luck('same')
    for (let i = 0; i < 300; i++) {
      for (const n of notations) expect(a.roll(n)).toBe(b.dice(n).total)
    }
    expect(a.draws).toBe(b.draws)
  })
})

describe('dice()', () => {
  it('shows every die and which ones were kept', () => {
    const r = luck('detail').dice('4d6kh3+2')
    const g = r.groups[0]
    expect(r.groups).toHaveLength(1)
    expect(g?.dice).toHaveLength(4)
    const kept = g?.dice.filter((d) => d.kept) ?? []
    const dropped = g?.dice.filter((d) => !d.kept) ?? []
    expect(kept).toHaveLength(3)
    expect(Math.min(...kept.map((d) => d.value))).toBeGreaterThanOrEqual(Math.max(...dropped.map((d) => d.value)))
    expect(r.modifier).toBe(2)
    expect(r.total).toBe(kept.reduce((s, d) => s + d.value, 0) + 2)
    expect(r.text).toMatch(/^4d6kh3 \(.+\) \+ 2 = \d+$/)
    expect(r.text).toContain('dropped')
    expect(r.notation).toBe('4d6kh3+2')
  })

  it('shows explosions as 6!+3', () => {
    const rng = luck('boom')
    for (let i = 0; i < 500; i++) {
      const r = rng.dice('1d6!')
      const d = r.groups[0]?.dice[0]
      expect(d?.value).toBe(d?.rolls.reduce((a, b) => a + b, 0))
      if ((d?.rolls.length ?? 0) > 1) {
        expect(r.text).toContain('!+')
        return
      }
    }
    throw new Error('no explosion seen in 500 rolls')
  })

  it('shows rerolls as 1→4', () => {
    const rng = luck('again')
    for (let i = 0; i < 500; i++) {
      const r = rng.dice('1d6r1')
      const d = r.groups[0]?.dice[0]
      if ((d?.rerolled.length ?? 0) > 0) {
        expect(d?.rerolled.every((f) => f === 1)).toBe(true)
        expect(r.text).toContain('1→')
        return
      }
    }
    throw new Error('no reroll seen in 500 rolls')
  })

  it('handles subtraction, multipliers and fudge dice', () => {
    const r = luck('mix').dice('1d6-1d4+5d4*10+4dF')
    expect(r.groups.map((g) => g.sign)).toEqual([1, -1, 1, 1])
    expect(r.groups[2]?.multiplier).toBe(10)
    expect(r.total).toBe(r.groups.reduce((s, g) => s + g.total, 0))
    expect(r.text).toContain(' - 1d4 (')
    expect(r.text).toContain('4dF (')
    expect(luck('neg').dice('-1d4').text).toMatch(/^-1d4 \(\d\) = -\d$/)
  })
})

describe('luck.odds()', () => {
  it('2d6 matches the classic triangle (1, 2, 3 … 6 … 1 in 36)', () => {
    const odds = luck.odds('2d6')
    for (let t = 2; t <= 12; t++) close(odds.chance(t), (6 - Math.abs(t - 7)) / 36, 15)
    expect(odds.min).toBe(2)
    expect(odds.max).toBe(12)
    close(odds.mean, 7)
    expect(odds.chance(1)).toBe(0)
    expect(odds.chance(13)).toBe(0)
    expect(odds.atLeast(2)).toBe(1)
    expect(odds.atLeast(13)).toBe(0)
    expect(odds.atMost(12)).toBe(1)
    expect(odds.atMost(1)).toBe(0)
    close(odds.atLeast(10), 6 / 36)
    close(odds.atMost(4), 6 / 36)
    close(odds.atLeast(9.5), 6 / 36)
  })

  it('4d6kh3 matches the published table (out of 1296)', () => {
    const counts = [1, 4, 10, 21, 38, 62, 91, 122, 148, 167, 172, 160, 131, 94, 54, 21]
    const odds = luck.odds('4d6kh3')
    counts.forEach((c, i) => close(odds.chance(i + 3), c / 1296))
    close(odds.mean, 15869 / 1296)
    expect(luck.odds('4d6dl1').totals).toEqual(odds.totals)
  })

  it('advantage and disadvantage on a d20', () => {
    const adv = luck.odds('2d20kh1')
    const dis = luck.odds('2d20kl1')
    for (let k = 1; k <= 20; k++) {
      close(adv.chance(k), (2 * k - 1) / 400)
      close(dis.chance(k), (41 - 2 * k) / 400)
    }
  })

  it('fudge dice: 4dF', () => {
    const counts = [1, 4, 10, 16, 19, 16, 10, 4, 1]
    const odds = luck.odds('4dF')
    counts.forEach((c, i) => close(odds.chance(i - 4), c / 81))
  })

  it('rerolls: r1, ro1 and r<2', () => {
    const r = luck.odds('1d6r1')
    expect(r.chance(1)).toBe(0)
    for (let f = 2; f <= 6; f++) close(r.chance(f), 1 / 5)
    const once = luck.odds('1d6ro1')
    close(once.chance(1), 1 / 36)
    for (let f = 2; f <= 6; f++) close(once.chance(f), 7 / 36)
    const low = luck.odds('1d6r<2')
    for (let f = 3; f <= 6; f++) close(low.chance(f), 1 / 4)
  })

  it('exploding: 1d6!', () => {
    const odds = luck.odds('1d6!')
    for (let f = 1; f <= 5; f++) close(odds.chance(f), 1 / 6)
    expect(odds.chance(6)).toBe(0)
    for (let f = 7; f <= 11; f++) close(odds.chance(f), 1 / 36)
    for (let f = 13; f <= 17; f++) close(odds.chance(f), 1 / 216)
    close(odds.mean, 4.2) // 3.5 × 6/5
  })

  it('multipliers, numbers and subtraction', () => {
    const m = luck.odds('5d4*10')
    expect(m.totals.every((t) => t.total % 10 === 0)).toBe(true)
    expect(m.min).toBe(50)
    expect(m.max).toBe(200)
    expect(luck.odds('7').chance(7)).toBe(1)
    const shifted = luck.odds('2d6+3')
    close(shifted.chance(10), 1 / 6)
    const diff = luck.odds('1d6-1d6')
    close(diff.mean, 0)
    for (let k = 1; k <= 5; k++) close(diff.chance(k), diff.chance(-k))
  })

  it('every total adds up to 1', () => {
    for (const n of ['3d6!kh2+1d4-2', '4d6r1dl1', '2d10ro<3*2+5', '10d6kh3', '6dF+2', '3d8!', '20d20kl5']) {
      const sum = luck.odds(n).totals.reduce((s, t) => s + t.chance, 0)
      close(sum, 1, 11)
    }
  })

  it('matches brute force for every keep and drop rule on small dice', () => {
    for (const sides of [2, 3, 4, 6]) {
      for (let count = 1; count <= 4; count++) {
        for (let k = 1; k <= count; k++) {
          for (const rule of ['kh', 'kl']) {
            const exact = new Map<number, number>()
            const outcomes = sides ** count
            for (let o = 0; o < outcomes; o++) {
              const faces: number[] = []
              let x = o
              for (let i = 0; i < count; i++) {
                faces.push((x % sides) + 1)
                x = Math.floor(x / sides)
              }
              faces.sort((a, b) => (rule === 'kh' ? b - a : a - b))
              const total = faces.slice(0, k).reduce((a, b) => a + b, 0)
              exact.set(total, (exact.get(total) ?? 0) + 1 / outcomes)
            }
            const odds = luck.odds(`${count}d${sides}${rule}${k}`)
            expect(odds.totals.length).toBe(exact.size)
            for (const [total, p] of exact) close(odds.chance(total), p)
          }
        }
      }
    }
  })

  it('agrees with 200,000 real rolls', () => {
    for (const n of ['3d6!kh2+1d4-2', '4d6r1dl1', '2d10ro<3*2+5']) {
      const rng = luck(`sim:${n}`)
      const seen = new Map<number, number>()
      const draws = 200_000
      for (let i = 0; i < draws; i++) {
        const t = rng.roll(n)
        seen.set(t, (seen.get(t) ?? 0) + 1)
      }
      const odds = luck.odds(n)
      for (const [total, count] of seen) {
        const p = odds.chance(total)
        expect(p).toBeGreaterThan(0)
        const sd = Math.sqrt((p * (1 - p)) / draws)
        expect(Math.abs(count / draws - p)).toBeLessThan(5 * sd + 1e-4)
      }
    }
  })

  it('an exploding face that is always rerolled never explodes', () => {
    expect(luck.odds('1d6!r6').totals).toEqual(luck.odds('1d6r6').totals)
    const rng = luck('never')
    for (let i = 0; i < 500; i++) expect(rng.roll('1d6!r6')).toBeLessThan(6)
  })

  it('handles groups that can total zero, with signs and multipliers', () => {
    const odds = luck.odds('-4dF*2')
    close(odds.chance(0), 19 / 81)
    close(odds.chance(8), 1 / 81)
    close(odds.chance(-8), 1 / 81)
  })

  it('keeps working past its cache size', () => {
    for (let i = 0; i < 250; i++) expect(luck.odds(`1d6+${i}`).min).toBe(1 + i)
    const rng = luck('cache')
    for (let i = 0; i < 600; i++) expect(rng.roll(`1d4+${i}`)).toBeGreaterThan(i)
  })

  it('caches results and freezes them', () => {
    const a = luck.odds('3d6')
    expect(luck.odds('3d6')).toBe(a)
    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.totals)).toBe(true)
  })

  // Works through about 60 million steps before giving up, so slow CI machines need more than 5 s.
  it('says when a notation is too big to work out exactly', { timeout: 30_000 }, () => {
    expectCode(() => luck.odds('1000d1000'), 'BAD_DICE')
    expect(() => luck.odds('1000d1000')).toThrow('Roll it many times instead')
    expect(() => luck.odds('d1000000!')).toThrow('too many possible totals')
    expect(luck('big').roll('1000d1000')).toBeGreaterThan(0) // rolling still works
  })

  it('explains bad arguments to its methods', () => {
    const odds = luck.odds('2d6')
    expectCode(() => odds.chance('7' as unknown as number), 'BAD_ARGUMENT')
    expectCode(() => odds.atLeast(Number.NaN), 'BAD_ARGUMENT')
    expectCode(() => odds.atMost(undefined as unknown as number), 'BAD_ARGUMENT')
  })
})
