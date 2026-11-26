import { LuckboxError, show } from './errors.ts'
import type { Rng } from './rng.ts'

/** A point in 2D. */
export interface Point {
  x: number
  y: number
}

/** Options for `rng.scatter()`. */
export interface ScatterOptions {
  /** Stop after this many points. Default: as many as fit. */
  maxPoints?: number
  /** Candidates tried around each point before giving up on it. Default: 30. */
  tries?: number
}

function positive(value: unknown, name: string, method: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new LuckboxError('BAD_ARGUMENT', `${method} needs ${name} to be a number above 0, got ${show(value)}.`)
  }
  return value
}

/**
 * Bridson's Poisson-disk sampling: points spread over a width × height area,
 * no two closer than `spacing`, with a natural, non-grid look.
 * Uses no trigonometry, so results are identical on every engine.
 */
export function scatter(rng: Rng, width: number, height: number, spacing: number, options: ScatterOptions = {}): Point[] {
  const method = 'scatter(width, height, spacing)'
  positive(width, 'width', method)
  positive(height, 'height', method)
  positive(spacing, 'spacing', method)
  if (options === null || typeof options !== 'object') {
    throw new LuckboxError('BAD_ARGUMENT', `scatter() options must be an object like { maxPoints: 100 }, got ${show(options)}.`)
  }
  const { maxPoints = Number.POSITIVE_INFINITY, tries = 30 } = options
  if (typeof maxPoints !== 'number' || Number.isNaN(maxPoints) || maxPoints < 0) {
    throw new LuckboxError('BAD_ARGUMENT', `scatter() maxPoints must be 0 or more, got ${show(maxPoints)}.`)
  }
  if (!Number.isSafeInteger(tries) || tries < 1) {
    throw new LuckboxError('BAD_ARGUMENT', `scatter() tries must be a whole number of 1 or more, got ${show(tries)}.`)
  }
  const cell = spacing / Math.SQRT2
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  if (cols * rows > 25_000_000) {
    throw new LuckboxError('BAD_ARGUMENT', `scatter(${width}, ${height}, ${spacing}) would place too many points. Use a bigger spacing.`)
  }
  const points: Point[] = []
  if (maxPoints < 1) return points
  const grid = new Int32Array(cols * rows).fill(-1)
  const active: number[] = []
  const r2 = spacing * spacing

  const add = (x: number, y: number): void => {
    grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = points.length
    active.push(points.length)
    points.push({ x, y })
  }
  const fits = (x: number, y: number): boolean => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let gy = Math.max(0, cy - 2); gy <= Math.min(rows - 1, cy + 2); gy++) {
      for (let gx = Math.max(0, cx - 2); gx <= Math.min(cols - 1, cx + 2); gx++) {
        const i = grid[gy * cols + gx] as number
        if (i === -1) continue
        const p = points[i] as Point
        const dx = p.x - x
        const dy = p.y - y
        if (dx * dx + dy * dy < r2) return false
      }
    }
    return true
  }

  add(rng.range(0, width), rng.range(0, height))
  while (active.length > 0 && points.length < maxPoints) {
    const slot = rng.int(0, active.length - 1)
    const from = points[active[slot] as number] as Point
    let placed = false
    for (let t = 0; t < tries; t++) {
      // A point in the ring between spacing and 2 × spacing, by rejection (no trig).
      let dx: number
      let dy: number
      let d2: number
      do {
        dx = rng.range(-2 * spacing, 2 * spacing)
        dy = rng.range(-2 * spacing, 2 * spacing)
        d2 = dx * dx + dy * dy
      } while (d2 < r2 || d2 >= 4 * r2)
      const x = from.x + dx
      const y = from.y + dy
      if (x < 0 || y < 0 || x >= width || y >= height || !fits(x, y)) continue
      add(x, y)
      placed = true
      break
    }
    if (!placed) {
      active[slot] = active[active.length - 1] as number
      active.pop()
    }
  }
  return points
}
