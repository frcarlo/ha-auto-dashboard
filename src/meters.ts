// Gas and water from HA's energy settings: the meters, their flow sensors and the gas price. How much went through
// today, this month and per hour of the last day comes from HA's statistics (the change of the meter), so it matches
// HA's own energy dashboard. All cards ask together and keep the answer for a while.
import type { HomeAssistant } from './types'

export type MeterKind = 'gas' | 'water'

export interface Meter {
  kind: MeterKind
  /** The meter readings (total), as HA's energy settings name them */
  meters: string[]
  /** Flow sensors, when set */
  rates?: string[]
  /** Price per unit of the meter: a number or a price entity */
  price?: number
  price_entity?: string
}

interface EnergySource {
  type: string
  stat_energy_from?: string
  stat_rate?: string | null
  number_energy_price?: number | null
  entity_energy_price?: string | null
}

/** Gas and water as HA's energy settings have them, keeping only meters that exist */
export function meterSources(hass: HomeAssistant, prefs: { energy_sources?: EnergySource[] } | undefined): Meter[] {
  const out: Meter[] = []
  for (const kind of ['gas', 'water'] as const) {
    const sources = (prefs?.energy_sources ?? []).filter(s => s.type === kind && s.stat_energy_from && hass.states[s.stat_energy_from])
    if (!sources.length) continue
    const rates = sources.map(s => s.stat_rate).filter((id): id is string => !!id && !!hass.states[id])
    const priced = sources.find(s => s.number_energy_price != null || s.entity_energy_price)
    out.push({
      kind, meters: sources.map(s => s.stat_energy_from!),
      ...(rates.length ? { rates } : {}),
      ...(priced?.number_energy_price != null ? { price: priced.number_energy_price } : {}),
      ...(priced?.entity_energy_price ? { price_entity: priced.entity_energy_price } : {}),
    })
  }
  return out
}

// ── Usage from the statistics ─────────────────────────────

export interface Usage {
  /** Since midnight, in the meter's unit */
  today: number
  month: number
  /** Per hour of the last day, oldest first */
  hours: [start: number, change: number][]
}

const STALE_MS = 10 * 60_000
const cache = new Map<string, { at: number; usage: Usage }>()
const loading = new Map<string, Promise<void>>()

const startOfDay = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }
const startOfMonth = (now: number) => { const d = new Date(startOfDay(now)); d.setDate(1); return d.getTime() }

type Stat = { start: number | string; change?: number | null }
const startOf = (s: Stat) => (typeof s.start === 'number' ? s.start : Date.parse(s.start))

/** Usage of the meters, summed; undefined until loaded */
export function usageOf(ids: string[]): Usage | undefined {
  const parts = ids.map(id => cache.get(id)?.usage)
  if (!parts.length || parts.some(p => !p)) return undefined
  const hours = new Map<number, number>()
  for (const p of parts) for (const [t, v] of p!.hours) hours.set(t, (hours.get(t) ?? 0) + v)
  return {
    today: parts.reduce((s, p) => s + p!.today, 0),
    month: parts.reduce((s, p) => s + p!.month, 0),
    hours: [...hours.entries()].sort((a, b) => a[0] - b[0]),
  }
}

export const usageFresh = (ids: string[], now = Date.now()) => ids.every(id => { const c = cache.get(id); return !!c && now - c.at < STALE_MS })

/** Hourly changes of the last day and the month's change, in two calls for all meters asked together */
export function loadUsage(hass: HomeAssistant, ids: string[], now = Date.now()): Promise<void> {
  const key = ids.join(',')
  if (!hass.callWS || !ids.length || usageFresh(ids, now)) return Promise.resolve()
  const running = loading.get(key)
  if (running) return running
  const job = (async () => {
    const day = startOfDay(now)
    const ask = (start: number, period: 'hour' | 'month') => hass.callWS!<Record<string, Stat[]>>({
      type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(), statistic_ids: ids, period, types: ['change'],
    }).catch(() => ({} as Record<string, Stat[]>))
    // A day back, or to midnight if that is further (never: a day is 24 hours, but DST makes it 23 or 25)
    const [hourly, monthly] = await Promise.all([ask(Math.min(day, now - 24 * 3600_000), 'hour'), ask(startOfMonth(now), 'month')])
    for (const id of ids) {
      const hours = (hourly?.[id] ?? []).map(s => [startOf(s), Number(s.change) || 0] as [number, number]).filter(([t]) => Number.isFinite(t))
      const month = (monthly?.[id] ?? []).reduce((sum, s) => sum + (Number(s.change) || 0), 0)
      cache.set(id, {
        at: now,
        usage: { today: hours.filter(([t]) => t >= day).reduce((s, [, v]) => s + v, 0), month, hours: hours.filter(([t]) => t >= now - 24 * 3600_000) },
      })
    }
  })().finally(() => loading.delete(key))
  loading.set(key, job)
  return job
}

/** For tests */
export function clearUsage() {
  cache.clear()
  loading.clear()
}

/** The meter's unit */
export function meterUnit(hass: HomeAssistant, meter: Meter): string {
  return String(hass.states[meter.meters[0]!]?.attributes.unit_of_measurement ?? 'm³')
}

export function formatVolume(value: number, unit: string, kind: MeterKind, lang: string): { value: string; unit: string } {
  // Water below a cubic metre reads better in litres
  if (kind === 'water' && unit === 'm³' && Math.abs(value) < 1) {
    return { value: new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value * 1000), unit: 'L' }
  }
  const digits = Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0
  return { value: new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value), unit }
}

/** The current flow, summed over the flow sensors; undefined without one */
export function meterFlow(hass: HomeAssistant, meter: Meter): { value: number; unit: string } | undefined {
  const readings = (meter.rates ?? []).map(id => hass.states[id]).filter(e => e && Number.isFinite(Number(e.state)))
  if (!readings.length) return undefined
  return { value: readings.reduce((s, e) => s + Number(e!.state), 0), unit: String(readings[0]!.attributes.unit_of_measurement ?? '') }
}

/** Price per unit: the price entity's state, or the fixed number */
export function meterPrice(hass: HomeAssistant, meter: Meter): number | undefined {
  if (meter.price_entity) {
    const n = Number(hass.states[meter.price_entity]?.state)
    if (Number.isFinite(n)) return n
  }
  return meter.price
}
