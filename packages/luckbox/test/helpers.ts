import { expect } from 'vitest'
import { LuckboxError, type LuckboxErrorCode } from '../src/errors.ts'

/** Expects `fn` to throw a LuckboxError with this code. */
export function expectCode(fn: () => unknown, code: LuckboxErrorCode): void {
  let caught: unknown
  try {
    fn()
  } catch (e) {
    caught = e
  }
  expect(caught, `expected a LuckboxError with code ${code}`).toBeInstanceOf(LuckboxError)
  expect((caught as LuckboxError).code).toBe(code)
  expect((caught as LuckboxError).message.startsWith('luckbox: ')).toBe(true)
}

/**
 * Pearson's chi-square statistic for observed counts against equal expected counts.
 * Our tests use fixed seeds, so results never flake. The limits are the p = 0.001
 * critical values, so a fair generator passes by a wide margin.
 */
export function chiSquare(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  const expected = total / counts.length
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0)
}

/** Chi-square critical values at p = 0.001, by degrees of freedom. */
export const CHI_001: Record<number, number> = { 1: 10.83, 2: 13.82, 5: 20.52, 15: 37.7, 31: 61.1, 255: 330.5 }

/** How many bits differ between two 32-bit words. */
export function bitDiff(a: number, b: number): number {
  let x = (a ^ b) >>> 0
  let n = 0
  while (x) {
    n += x & 1
    x >>>= 1
  }
  return n
}
