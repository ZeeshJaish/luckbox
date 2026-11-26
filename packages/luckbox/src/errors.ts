/**
 * Every problem luckbox reports has a stable `code` you can check,
 * and a message that says how to fix it.
 */
export type LuckboxErrorCode =
  | 'BAD_SEED'
  | 'BAD_ARGUMENT'
  | 'EMPTY_LIST'
  | 'BAD_STATE'
  | 'BAD_ALGORITHM'
  | 'BAD_DATE'
  | 'BAD_TIMEZONE'

/**
 * The error luckbox throws. Check `error.code` rather than the message text,
 * which may get clearer over time.
 *
 * @example
 * try { rng.pick([]) } catch (e) {
 *   if (e instanceof LuckboxError && e.code === 'EMPTY_LIST') { ... }
 * }
 */
export class LuckboxError extends Error {
  /** A stable code for this kind of problem. */
  readonly code: LuckboxErrorCode

  constructor(code: LuckboxErrorCode, message: string) {
    super(`luckbox: ${message}`)
    this.name = 'LuckboxError'
    this.code = code
  }
}

/** Short, readable version of any value for error messages. */
export function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)
  if (Array.isArray(value)) return `[${value.map(show).join(', ')}]`
  if (value !== null && typeof value === 'object') return 'an object'
  return String(value)
}
