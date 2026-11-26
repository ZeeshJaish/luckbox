/*
 * Deterministic maths.
 *
 * JavaScript's Math.log, Math.exp and friends are "implementation-approximated":
 * browsers may round the last bit differently, which would make seeded results
 * differ between Chrome, Safari and Firefox. These versions use only + - * /
 * and exact bit tricks, which IEEE 754 makes identical everywhere. They are
 * accurate to about one unit in the last place.
 */

const view = new DataView(new ArrayBuffer(8))

/** ln(2) split in two so k·ln(2) stays exact (from fdlibm). */
const LN2_HI = 6.93147180369123816490e-1
const LN2_LO = 1.90821492927058770002e-10
const LN2 = 0.6931471805599453
const SQRT2 = 1.4142135623730951

/** Exactly 2^k, for any whole k a double can reach. */
export function pow2(k: number): number {
  if (k > 1023) return pow2(1023) * pow2(k - 1023)
  if (k < -1022) return pow2(k + 600) * pow2(-600)
  view.setUint32(0, (k + 1023) << 20)
  view.setUint32(4, 0)
  return view.getFloat64(0)
}

/** The power of two of a positive, finite x: x = m · 2^k with 1 ≤ m < 2. */
function exponentOf(x: number): number {
  view.setFloat64(0, x)
  const e = (view.getUint32(0) >>> 20) & 0x7ff
  if (e === 0) return exponentOf(x * 18014398509481984) - 54 // subnormal: scale by 2^54
  return e - 1023
}

/** Natural logarithm, the same on every engine. */
export function ln(x: number): number {
  if (x === 1) return 0
  if (!(x > 0)) return x === 0 ? Number.NEGATIVE_INFINITY : Number.NaN
  if (x === Number.POSITIVE_INFINITY) return x
  // Subnormal numbers: scale into the normal range first (2^54 is exact).
  if (x < 2.2250738585072014e-308) return ln(x * 18014398509481984) - 54 * LN2_HI - 54 * LN2_LO
  let k = exponentOf(x)
  let m = x * pow2(-k)
  if (m > SQRT2) {
    m /= 2
    k++
  }
  // ln(m) = 2·atanh(s), s = (m − 1)/(m + 1), |s| ≤ 0.1716
  const s = (m - 1) / (m + 1)
  const z = s * s
  const p =
    z *
    (1 / 3 +
      z * (1 / 5 + z * (1 / 7 + z * (1 / 9 + z * (1 / 11 + z * (1 / 13 + z * (1 / 15 + z * (1 / 17 + z * (1 / 19 + z * (1 / 21 + z / 23))))))))))
  return k * LN2_HI + (2 * s + (2 * s * p + k * LN2_LO))
}

const INV_FACT = [1, 1, 1 / 2, 1 / 6, 1 / 24, 1 / 120, 1 / 720, 1 / 5040, 1 / 40320, 1 / 362880, 1 / 3628800, 1 / 39916800, 1 / 479001600, 1 / 6227020800, 1 / 87178291200]

/** e^x, the same on every engine. */
export function exp(x: number): number {
  if (x === 0) return 1
  if (x !== x) return Number.NaN
  if (x > 709.782712893384) return Number.POSITIVE_INFINITY
  if (x < -745.1332191019412) return 0
  const k = Math.round(x / LN2)
  const r = x - k * LN2_HI - k * LN2_LO // |r| ≤ 0.35
  let e = INV_FACT[14] as number
  for (let n = 13; n >= 0; n--) e = e * r + (INV_FACT[n] as number)
  // Scale in two steps at the edges so the result doesn't overflow or underflow early.
  if (k > 1023) return e * pow2(k - 1) * 2
  if (k < -1022) return e * pow2(k + 600) * pow2(-600)
  return e * pow2(k)
}

const STIRLING = [
  8.333333333333333e-2, -2.777777777777778e-3, 7.936507936507937e-4, -5.952380952380952e-4, 8.417508417508418e-4,
  -1.917526917526918e-3, 6.41025641025641e-3, -2.955065359477124e-2, 1.796443723688307e-1, -1.3924322169059,
]
const HALF_LOG_2PI = 0.9189385332046727

/** ln Γ(x) for x ≥ 1 (Stirling's series, shifted up for small x). */
export function lnGamma(x: number): number {
  if (x === 1 || x === 2) return 0
  let x0 = x
  let n = 0
  if (x <= 7) {
    n = Math.floor(7 - x)
    x0 = x + n
  }
  const x2 = 1 / (x0 * x0)
  let g = STIRLING[9] as number
  for (let k = 8; k >= 0; k--) g = g * x2 + (STIRLING[k] as number)
  let result = g / x0 + HALF_LOG_2PI + (x0 - 0.5) * ln(x0) - x0
  for (let k = 1; k <= n; k++) {
    result -= ln(x0 - 1)
    x0 -= 1
  }
  return result
}
