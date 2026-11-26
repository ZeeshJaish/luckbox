import { LuckboxError, show } from './errors.ts'

/** Which day (or week) to use, and where in the world. */
export interface DayOptions {
  /**
   * The moment to use: a `Date`, milliseconds, or an ISO date-time string.
   * A plain calendar date like `'2026-11-26'` is used exactly as written.
   * Default: now.
   */
  date?: Date | number | string
  /**
   * The time zone whose calendar decides the day, like `'Asia/Kolkata'`.
   * Default: `'UTC'`, the same day for every player in the world.
   */
  timeZone?: string
  /**
   * The hour the new day starts, from 0 to 23 (decimals allowed: 4.5 is 4:30).
   * Many games reset at 4 or 5 in the morning. Default: 0 (midnight).
   */
  resetHour?: number
}

const HOUR = 3_600_000
const DAY = 86_400_000
const formatters = new Map<string, Intl.DateTimeFormat>()

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        calendar: 'gregory',
        numberingSystem: 'latn',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    } catch {
      throw new LuckboxError(
        'BAD_TIMEZONE',
        `unknown time zone ${show(timeZone)}. Use a name like 'UTC', 'Europe/London' or 'Asia/Kolkata'.`,
      )
    }
    formatters.set(timeZone, f)
  }
  return f
}

/** A real calendar date check for 'YYYY-MM-DD'. */
function parseCalendarDate(text: string): [number, number, number] | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    throw new LuckboxError('BAD_DATE', `${show(text)} is not a real calendar date.`)
  }
  return [y, mo, d]
}

/** The local calendar date [year, month, day] for the options. */
function localDate(options: DayOptions | undefined): [number, number, number] {
  if (options !== undefined && (options === null || typeof options !== 'object')) {
    throw new LuckboxError('BAD_ARGUMENT', `day options must be an object, got ${show(options)}.`)
  }
  const { date = Date.now(), timeZone = 'UTC', resetHour = 0 } = options ?? {}

  if (typeof timeZone !== 'string') {
    throw new LuckboxError('BAD_TIMEZONE', `timeZone must be text like 'Asia/Kolkata', got ${show(timeZone)}.`)
  }
  if (typeof resetHour !== 'number' || !(resetHour >= 0 && resetHour < 24)) {
    throw new LuckboxError('BAD_ARGUMENT', `resetHour must be from 0 up to (not including) 24, got ${show(resetHour)}.`)
  }

  if (typeof date === 'string') {
    const calendar = parseCalendarDate(date)
    if (calendar) {
      formatter(timeZone) // still report a bad time zone
      return calendar
    }
  }

  let ms: number
  // Not `instanceof Date`: that fails for Dates from iframes, workers' hosts or test sandboxes.
  if (Object.prototype.toString.call(date) === '[object Date]') ms = Date.prototype.getTime.call(date)
  else if (typeof date === 'number') ms = date
  else if (typeof date === 'string') ms = Date.parse(date)
  else throw new LuckboxError('BAD_DATE', `date must be a Date, milliseconds or a date string, got ${show(date)}.`)
  if (!Number.isFinite(ms)) {
    throw new LuckboxError('BAD_DATE', `${show(date)} is not a valid date.`)
  }

  const shifted = new Date(ms - resetHour * HOUR)
  if (timeZone === 'UTC') {
    return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()]
  }
  const parts = formatter(timeZone).formatToParts(shifted)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
  return [get('year'), get('month'), get('day')]
}

/**
 * Today's date as `'YYYY-MM-DD'`, for daily challenges and streaks.
 * @example luck.dayKey() // '2026-11-26'
 * @example luck.dayKey({ timeZone: 'Asia/Kolkata', resetHour: 4 })
 */
export function dayKey(options?: DayOptions): string {
  const [y, m, d] = localDate(options)
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

/**
 * This week as an ISO week like `'2026-W48'` (weeks start on Monday).
 * @example luck.weekKey() // '2026-W48'
 */
export function weekKey(options?: DayOptions): string {
  const [y, m, d] = localDate(options)
  const day = new Date(Date.UTC(y, m - 1, d))
  const mondayBased = (day.getUTCDay() + 6) % 7
  const thursday = new Date(day.getTime() + (3 - mondayBased) * DAY)
  const isoYear = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / DAY / 7) + 1
  return `${pad(isoYear, 4)}-W${pad(week, 2)}`
}
