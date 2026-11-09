// Switching an entity can take a while (Zigbee, Matter, a cloud). Every card that switches something registers what
// it expects to change here; tiles, headings and room cards showing those entities mark them as waiting until HA
// reports the new state, and say so for a moment when nothing came back.
import type { HassEntity, HomeAssistant } from './types'

/** Answers quicker than this show nothing, so a fast switch doesn't flicker. */
export const SHOW_AFTER = 350
/** No new state by then: stop waiting. */
export const GIVE_UP = 15000
/** How long "no response" stays. */
export const FAILED_FOR = 5000

interface Entry {
  from?: HassEntity
  /** The state itself must change (on → off), not just an attribute */
  flip: boolean
  shown: boolean
  timers: number[]
}

const waiting = new Map<string, Entry>()
const failed = new Map<string, number>()
const listeners = new Set<(ids: string[]) => void>()

const notify = (ids: string[]) => queueMicrotask(() => listeners.forEach(l => l(ids)))

/** Called with the ids whose waiting or failed state changed. */
export function subscribe(listener: (ids: string[]) => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Waiting for long enough that it shows. */
export const isWaiting = (id: string) => !!waiting.get(id)?.shown
/** The last switch got no answer, or HA refused it. */
export const hasFailed = (id: string) => failed.has(id)

const GONE = ['unavailable', 'unknown']

/**
 * The entities a service call should change, and whether their state has to flip. Calls that may well change
 * nothing (stop a cover, a target temperature, a remote key) aren't tracked.
 */
export function expected(hass: HomeAssistant, domain: string, service: string, ids: string[], data: Record<string, unknown> = {}) {
  const states = ids.map(id => hass.states[id]).filter((e): e is HassEntity => !!e && !GONE.includes(e.state))
  const unless = (state: string) => states.filter(e => e.state !== state).map(e => e.entity_id)
  const all = states.map(e => e.entity_id)
  const scene = domain === 'scene' || domain === 'script'
  switch (service) {
    case 'toggle': return { ids: all, flip: true }
    // Dimming changes only the brightness
    case 'turn_on': return scene || Object.keys(data).length ? { ids: all, flip: false } : { ids: unless('on'), flip: true }
    case 'turn_off': return { ids: unless('off'), flip: true }
    case 'lock': return { ids: unless('locked'), flip: true }
    case 'unlock': return { ids: unless('unlocked'), flip: true }
    case 'open_cover': return { ids: unless('open'), flip: true }
    case 'close_cover': return { ids: unless('closed'), flip: true }
    case 'open': case 'start': case 'return_to_base': return { ids: all, flip: false }
    default: return { ids: [] as string[], flip: false }
  }
}

function finish(id: string, gaveUp: boolean) {
  const entry = waiting.get(id)
  if (!entry) return
  entry.timers.forEach(clearTimeout)
  waiting.delete(id)
  if (gaveUp) {
    clearTimeout(failed.get(id))
    failed.set(id, setTimeout(() => {
      failed.delete(id)
      notify([id])
    }, FAILED_FOR))
  }
  notify([id])
}

/** A service call went out: wait for what it should change. */
export function track(hass: HomeAssistant, domain: string, service: string, ids: string[], data: Record<string, unknown> | undefined, result?: Promise<unknown>) {
  const { ids: changing, flip } = expected(hass, domain, service, ids, data)
  for (const id of changing) {
    waiting.get(id)?.timers.forEach(clearTimeout)
    if (failed.has(id)) {
      clearTimeout(failed.get(id))
      failed.delete(id)
    }
    const entry: Entry = { from: hass.states[id], flip, shown: false, timers: [] }
    entry.timers.push(setTimeout(() => {
      entry.shown = true
      notify([id])
    }, SHOW_AFTER))
    // Only a switch that should have flipped and didn't is worth a "no response"
    entry.timers.push(setTimeout(() => finish(id, flip), GIVE_UP))
    waiting.set(id, entry)
  }
  if (changing.length) notify(changing)
  // HA refused the call (device gone, no rights): say so right away
  result?.catch(() => changing.forEach(id => {
    if (!waiting.has(id)) return
    finish(id, true)
  }))
}

/** With every new hass: entities whose new state arrived stop waiting. */
export function settle(hass: HomeAssistant) {
  if (!waiting.size) return
  for (const [id, entry] of [...waiting]) {
    const now = hass.states[id]
    if (now === entry.from) continue
    // A light reporting a new attribute before it switched is still on its way
    if (entry.flip && now && entry.from && now.state === entry.from.state) continue
    finish(id, false)
  }
}

/** For tests: forget everything. */
export function resetPending() {
  for (const entry of waiting.values()) entry.timers.forEach(clearTimeout)
  for (const timer of failed.values()) clearTimeout(timer)
  waiting.clear()
  failed.clear()
}
