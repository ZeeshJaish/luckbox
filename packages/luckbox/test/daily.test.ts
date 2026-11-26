import { describe, expect, it } from 'vitest'
import { type DayOptions, luck } from '../src/index.ts'
import { expectCode } from './helpers.ts'

const at = (iso: string): Date => new Date(iso)

describe('luck.dayKey()', () => {
  it('uses a calendar date exactly as written', () => {
    expect(luck.dayKey({ date: '2026-11-26' })).toBe('2026-11-26')
    expect(luck.dayKey({ date: '2028-02-29' })).toBe('2028-02-29')
  })

  it('uses UTC by default, the same day for every player', () => {
    expect(luck.dayKey({ date: at('2026-11-26T20:00:00Z') })).toBe('2026-11-26')
    expect(luck.dayKey({ date: at('2026-11-26T23:59:59.999Z') })).toBe('2026-11-26')
    expect(luck.dayKey({ date: at('2026-11-27T00:00:00Z') })).toBe('2026-11-27')
  })

  it('follows a time zone when you choose one', () => {
    const moment = at('2026-11-26T20:00:00Z') // 01:30 on the 27th in India
    expect(luck.dayKey({ date: moment, timeZone: 'Asia/Kolkata' })).toBe('2026-11-27')
    expect(luck.dayKey({ date: moment, timeZone: 'America/Los_Angeles' })).toBe('2026-11-26')
    expect(luck.dayKey({ date: moment, timeZone: 'Pacific/Kiritimati' })).toBe('2026-11-27')
  })

  it('starts the new day at resetHour', () => {
    expect(luck.dayKey({ date: at('2026-11-26T03:59:00Z'), resetHour: 4 })).toBe('2026-11-25')
    expect(luck.dayKey({ date: at('2026-11-26T04:00:00Z'), resetHour: 4 })).toBe('2026-11-26')
    expect(luck.dayKey({ date: at('2026-11-26T04:29:00Z'), resetHour: 4.5 })).toBe('2026-11-25')
    // 03:30 on the 27th in India, before a 4am reset: still the 26th's daily
    expect(luck.dayKey({ date: at('2026-11-26T22:00:00Z'), timeZone: 'Asia/Kolkata', resetHour: 4 })).toBe('2026-11-26')
  })

  it('accepts milliseconds and ISO date-time text', () => {
    expect(luck.dayKey({ date: Date.UTC(2026, 10, 26, 12) })).toBe('2026-11-26')
    expect(luck.dayKey({ date: '2026-11-26T12:00:00Z' })).toBe('2026-11-26')
  })

  it('uses today when no date is given', () => {
    const before = new Date().toISOString().slice(0, 10)
    const key = luck.dayKey()
    const after = new Date().toISOString().slice(0, 10)
    expect([before, after]).toContain(key)
  })

  it('explains bad input', () => {
    expectCode(() => luck.dayKey({ date: '2026-02-30' }), 'BAD_DATE')
    expectCode(() => luck.dayKey({ date: 'not a date' }), 'BAD_DATE')
    expectCode(() => luck.dayKey({ date: Number.NaN }), 'BAD_DATE')
    expectCode(() => luck.dayKey({ date: new Date('nope') }), 'BAD_DATE')
    expectCode(() => luck.dayKey({ date: true as unknown as string }), 'BAD_DATE')
    expectCode(() => luck.dayKey({ timeZone: 'Mars/Olympus' }), 'BAD_TIMEZONE')
    expectCode(() => luck.dayKey({ date: '2026-11-26', timeZone: 'Mars/Olympus' }), 'BAD_TIMEZONE')
    expectCode(() => luck.dayKey({ timeZone: 5 as unknown as string }), 'BAD_TIMEZONE')
    for (const resetHour of [24, -1, Number.NaN, '4']) {
      expectCode(() => luck.dayKey({ resetHour } as unknown as DayOptions), 'BAD_ARGUMENT')
    }
    expectCode(() => luck.dayKey('2026-11-26' as unknown as DayOptions), 'BAD_ARGUMENT')
    expectCode(() => luck.dayKey(null as unknown as DayOptions), 'BAD_ARGUMENT')
  })
})

describe('luck.weekKey()', () => {
  it.each([
    ['2026-11-26', '2026-W48'],
    ['2026-01-01', '2026-W01'], // a Thursday: week 1
    ['2027-01-01', '2026-W53'], // a Friday: still the last week of 2026
    ['2024-12-30', '2025-W01'], // a Monday: already week 1 of 2025
    ['2021-01-03', '2020-W53'], // a Sunday: 2020 had 53 weeks
    ['2026-11-23', '2026-W48'], // Monday of the same week
    ['2026-11-29', '2026-W48'], // Sunday of the same week
    ['2026-11-30', '2026-W49'],
  ])('%s is %s', (date, week) => {
    expect(luck.weekKey({ date })).toBe(week)
  })
})

describe('luck.daily() and luck.weekly()', () => {
  it('give every player the same numbers on the same day', () => {
    const a = luck.daily({ date: '2026-11-26' })
    const b = luck.daily({ date: at('2026-11-26T18:00:00Z') })
    expect(a.uint32()).toBe(b.uint32())
  })

  it('use a seed you can show and replay', () => {
    const today = luck.daily({ date: '2026-11-26' })
    expect(today.seed).toBe('daily:2026-11-26')
    expect(today.uint32()).toBe(luck('daily:2026-11-26').uint32())
  })

  it('change every day', () => {
    expect(luck.daily({ date: '2026-11-26' }).uint32()).not.toBe(luck.daily({ date: '2026-11-27' }).uint32())
  })

  it('use a salt so your game differs from other games', () => {
    const mine = luck.daily({ date: '2026-11-26', salt: 'popstar' })
    expect(mine.seed).toBe('popstar:daily:2026-11-26')
    expect(mine.uint32()).not.toBe(luck.daily({ date: '2026-11-26' }).uint32())
  })

  it('weekly works the same way', () => {
    const week = luck.weekly({ date: '2026-11-26', salt: 'popstar' })
    expect(week.seed).toBe('popstar:weekly:2026-W48')
    expect(luck.weekly({ date: '2026-11-29' }).seed).toBe('weekly:2026-W48')
  })

  it('take an algorithm and pass time zones through', () => {
    expect(luck.daily({ date: '2026-11-26', algorithm: 'mulberry32' }).algorithm).toBe('mulberry32')
    expect(luck.daily({ date: at('2026-11-26T20:00:00Z'), timeZone: 'Asia/Kolkata' }).seed).toBe('daily:2026-11-27')
    expect(luck.daily().seed).toMatch(/^daily:\d{4}-\d{2}-\d{2}$/)
  })

  it('explain a bad salt', () => {
    expectCode(() => luck.daily({ salt: 5 as unknown as string }), 'BAD_ARGUMENT')
  })
})
