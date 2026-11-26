// luckbox's promise: the same seed gives the same results in every version.
// If this test fails, a change broke that promise for everyone's saved seeds.
// Never "fix" it by updating locked.json; fix the code instead.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lockedValues } from './locked-cases.ts'

const expected = JSON.parse(readFileSync(new URL('./locked.json', import.meta.url), 'utf8')) as Record<string, unknown>
const actual = lockedValues()

describe('locked results (never change)', () => {
  it.each(Object.keys(expected).filter((k) => k !== '_note'))('%s', (key) => {
    expect(actual[key]).toEqual(expected[key])
  })

  it('covers every case', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).filter((k) => k !== '_note').sort())
  })
})
