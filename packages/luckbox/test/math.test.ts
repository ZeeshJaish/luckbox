// luckbox's own ln/exp must match the built-ins to within one unit in the last place.
import { describe, expect, it } from 'vitest'
import { exp, ln, lnGamma, pow2 } from '../src/math.ts'

const ulps = (a: number, b: number): number => {
  if (Object.is(a, b)) return 0
  return Math.abs(a - b) / (Math.abs(b) * Number.EPSILON || Number.MIN_VALUE)
}

describe('ln()', () => {
  it('is within 1 ulp of Math.log from 1e-300 to 1e300', () => {
    let worst = 0
    for (let i = 0; i < 200_000; i++) {
      const x = 10 ** (((i * 7919) % 600_000) / 1000 - 300)
      worst = Math.max(worst, ulps(ln(x), Math.log(x)))
    }
    expect(worst).toBeLessThanOrEqual(1)
  })

  it('handles the edges', () => {
    expect(ln(1)).toBe(0)
    expect(ln(0)).toBe(Number.NEGATIVE_INFINITY)
    expect(ln(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(ln(-1)).toBeNaN()
    expect(ln(Number.NaN)).toBeNaN()
    expect(ln(5e-324)).toBe(Math.log(5e-324))
    expect(ulps(ln(1 + 1e-10), Math.log(1 + 1e-10))).toBeLessThanOrEqual(1)
    expect(ulps(ln(Number.MAX_VALUE), Math.log(Number.MAX_VALUE))).toBeLessThanOrEqual(1)
  })
})

describe('exp()', () => {
  it('is within 1 ulp of Math.exp from -700 to 700', () => {
    let worst = 0
    for (let i = 0; i < 200_000; i++) {
      const x = ((i * 7919) % 1_400_000) / 1000 - 700
      worst = Math.max(worst, ulps(exp(x), Math.exp(x)))
    }
    expect(worst).toBeLessThanOrEqual(1)
  })

  it('handles the edges', () => {
    expect(exp(0)).toBe(1)
    expect(exp(709.7)).toBe(Math.exp(709.7))
    expect(exp(710)).toBe(Number.POSITIVE_INFINITY)
    expect(exp(-745)).toBe(Math.exp(-745))
    expect(exp(-746)).toBe(0)
    expect(exp(Number.NaN)).toBeNaN()
  })
})

describe('lnGamma() and pow2()', () => {
  it('lnGamma(k + 1) equals ln(k!) to 15 digits', () => {
    let sum = 0
    for (let k = 1; k <= 2000; k++) {
      sum += Math.log(k)
      expect(Math.abs(lnGamma(k + 1) - sum) / Math.max(1, sum)).toBeLessThan(1e-14)
    }
    expect(lnGamma(1)).toBe(0)
    expect(lnGamma(2)).toBe(0)
  })

  it('pow2 is exact', () => {
    expect(pow2(0)).toBe(1)
    expect(pow2(10)).toBe(1024)
    expect(pow2(-1)).toBe(0.5)
    expect(pow2(1023)).toBe(2 ** 1023)
    expect(pow2(-1074)).toBe(5e-324)
  })
})
