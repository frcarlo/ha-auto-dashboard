// The last day of a sensor as a thin line behind its value. The points are HA's hourly means from the long-term
// statistics, so only sensors HA keeps statistics for (state_class measurement) get one. All tiles on a page ask
// together: their ids are collected for a moment and fetched in one call, then kept for a while.
import type { HassEntity, HomeAssistant } from './types'

export const SPARK_HOURS = 24
/** Fetched again after this long */
const STALE_MS = 10 * 60_000
/** Tiles that render together ask in one call */
const BATCH_MS = 60

interface Entry { at: number; points: [time: number, value: number][] }

const cache = new Map<string, Entry>()
const pending = new Set<string>()
const waiters = new Map<string, (() => void)[]>()
let timer: ReturnType<typeof setTimeout> | undefined

/** Sensors HA keeps hourly means for: measurements with a number */
export function hasSpark(entity: HassEntity | undefined): boolean {
  return !!entity && entity.attributes.state_class === 'measurement' && Number.isFinite(Number(entity.state))
}

/** The hourly means of the last day, with the current value at the end */
export function sparkPoints(entity: HassEntity, now = Date.now()): [number, number][] {
  const points = cache.get(entity.entity_id)?.points ?? []
  const current = Number(entity.state)
  return Number.isFinite(current) && points.length ? [...points, [now, current]] : points
}

export const sparkFresh = (id: string, now = Date.now()) => {
  const entry = cache.get(id)
  return !!entry && now - entry.at < STALE_MS
}

/** Fetches the entity's statistics unless they are fresh or already on their way; resolves when they are in */
export function loadSpark(hass: HomeAssistant, id: string): Promise<void> {
  if (sparkFresh(id) || !hass.callWS) return Promise.resolve()
  return new Promise(resolve => {
    // Asked already: waiting for the batch or the answer
    const asked = waiters.has(id)
    waiters.set(id, [...(waiters.get(id) ?? []), resolve])
    if (asked) return
    pending.add(id)
    clearTimeout(timer)
    timer = setTimeout(() => void flush(hass), BATCH_MS)
  })
}

type Stat = { start: number | string; mean?: number | null }

async function flush(hass: HomeAssistant) {
  const ids = [...pending]
  pending.clear()
  const end = Date.now()
  let result: Record<string, Stat[]> = {}
  try {
    result = (await hass.callWS!<Record<string, Stat[]>>({
      type: 'recorder/statistics_during_period', start_time: new Date(end - SPARK_HOURS * 3600_000).toISOString(),
      statistic_ids: ids, period: 'hour', types: ['mean'],
    })) ?? {}
  } catch {
    // Without statistics (no access, recorder off) the tiles stay as they were
  }
  for (const id of ids) {
    const points = (result[id] ?? [])
      .map(s => [typeof s.start === 'number' ? s.start : Date.parse(s.start), Number(s.mean)] as [number, number])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    cache.set(id, { at: end, points })
    for (const done of waiters.get(id) ?? []) done()
    waiters.delete(id)
  }
}

/**
 * An SVG path through the points in a 100 × 32 box, the lowest value at the bottom and the highest at the top
 * with a little room; a flat line runs through the middle. Also the area under it, closed along the floor
 * (the bottom of the box unless it reaches further down).
 */
export function sparkPath(points: [number, number][], width = 100, height = 32, floor = height): { line: string; area: string } | undefined {
  if (points.length < 2) return undefined
  const t0 = points[0]![0]
  const span = Math.max(1, points[points.length - 1]![0] - t0)
  const values = points.map(p => p[1])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = 2
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - 2 * pad))
  const coords = points.map(([t, v]) => `${(((t - t0) / span) * width).toFixed(2)},${y(v).toFixed(2)}`)
  const line = `M${coords.join('L')}`
  return { line, area: `${line}L${width},${floor}L0,${floor}Z` }
}

/** For tests: forget everything */
export function clearSparks() {
  cache.clear()
  pending.clear()
  waiters.clear()
}
