// What happened today on a page: lights switched, blinds moved, doors opened, locks unlocked, motion seen.
// Read from HA's history, one entry per change, so the page can list them beside its tiles.
import { deviceClassOf, domainOf } from './presentation'
import type { HassEntity } from './types'

export interface Activity {
  entity: string
  /** The state the entity changed to */
  state: string
  at: number
}

/** History rows as HA's websocket sends them: s is the state, lu when it was last updated (seconds) */
type Row = { s: string; lu?: number; lc?: number }

/** Sensors where only the start counts: "motion detected" says something, "motion cleared" a moment later does not */
const ONLY_ON = ['motion', 'moving', 'occupancy', 'presence', 'smoke', 'gas', 'carbon_monoxide', 'moisture', 'safety', 'heat', 'cold', 'tamper', 'problem']

/** States that are a step on the way, not where the entity ended up */
const PASSING = ['opening', 'closing', 'locking', 'unlocking', 'unavailable', 'unknown']

/** Repeats of the same "on" within this time are one event: someone walking through the hall is not five */
const SAME_EVENT_MS = 120_000

/** Whether this change is worth an entry: every change between settled states, for alerts only the start. */
function counts(entity: HassEntity | undefined, id: string, state: string) {
  if (PASSING.includes(state)) return false
  if (domainOf(id) === 'binary_sensor' && ONLY_ON.includes(deviceClassOf(entity) ?? '')) return state === 'on'
  return true
}

/**
 * The day's changes, newest first. The first row of each entity is the state the day began with, not a change;
 * a row with the same state as before only changed attributes (a light dimmed), and is no entry either.
 */
export function activitiesFrom(history: Record<string, Row[]>, states: Record<string, HassEntity>, since: number): Activity[] {
  const out: Activity[] = []
  for (const [id, rows] of Object.entries(history)) {
    let before: string | undefined
    let lastOn = -Infinity
    for (const [i, row] of rows.entries()) {
      if (PASSING.includes(row.s)) continue
      const at = (row.lu ?? row.lc ?? 0) * 1000
      const changed = i > 0 && before !== undefined && row.s !== before
      before = row.s
      if (!changed || at < since || !counts(states[id], id, row.s)) continue
      if (row.s === 'on' && domainOf(id) === 'binary_sensor') {
        if (at - lastOn < SAME_EVENT_MS) continue
        lastOn = at
      }
      out.push({ entity: id, state: row.s, at })
    }
  }
  return out.sort((a, b) => b.at - a.at)
}
