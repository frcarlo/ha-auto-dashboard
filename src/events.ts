// What is coming up or wants doing, as chips in the status bar: the bin to put out, a weather warning, a birthday,
// a parcel due today, an appliance that finished, a room that needs air. The sources are found once by the
// strategy; the card works out from them which chips to show right now.
import { appliancePhase, applianceIcon, type Appliance } from './appliances'
import { entityAreaId, entityIndex, type Hide } from './model'
import { domainOf, entityName } from './presentation'
import { activeWarnings } from './weather'
import type { EventKey, HomeAssistant } from './types'

/** CO₂ in ppm from which a room counts as stuffy */
export const CO2_LIMIT = 1200

export interface EventSources {
  /** Waste collection sensors: date-keyed attributes or a daysTo count */
  waste?: string[]
  /** NINA binary sensors, DWD warning sensors */
  warnings?: string[]
  co2?: string[]
  co2_limit?: number
  /** Calendars searched for today's birthdays */
  birthdays?: string[]
  /** Calendars of parcel services: today's deliveries */
  parcels?: string[]
  appliances?: Appliance[]
}

export type { EventKey } from './types'

const PARCEL = /zustell|deliver|parcel|paket|sendung|lieferung|package|dhl|dpd|hermes|ups\b|gls/i
const WASTE = /waste|abfall|m(ü|u|ue)ll|tonne|bin\b/i
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const isWasteSensor = (hass: HomeAssistant, id: string) => {
  const e = hass.states[id]
  if (!e || domainOf(id) !== 'sensor') return false
  const fromWcs = hass.entities[id]?.platform === 'waste_collection_schedule'
  const dated = Object.keys(e.attributes).some(k => DATE_KEY.test(k)) || typeof e.attributes.daysTo === 'number'
  return dated && (fromWcs || WASTE.test(`${id} ${entityName(e)}`))
}

const isCurrentWarning = (hass: HomeAssistant, id: string) => {
  const e = hass.states[id]
  const entry = hass.entities[id]
  if (!e) return false
  // DWD: the current level, not the advance one (which repeats tomorrow's)
  if (entry?.platform === 'dwd_weather_warnings' || (domainOf(id) === 'sensor' && e.attributes.warning_count !== undefined && e.attributes.region_name !== undefined)) {
    return !/advance|vorwarn|vorab/i.test(`${id} ${entry?.translation_key ?? ''}`)
  }
  // NINA: one binary sensor per warning slot
  return domainOf(id) === 'binary_sensor' && (entry?.platform === 'nina' || (e.attributes.device_class === 'safety' && /warn/i.test(`${id} ${entityName(e)}`)))
}

/**
 * Where the chips come from, for the whole house: waste, warnings, birthdays and parcels don't belong to a room;
 * CO₂ and appliances are limited to the dashboard's rooms by the caller. Chips hidden on the dashboard are left out.
 */
export function findEventSources(
  hass: HomeAssistant,
  opts: { hide?: Hide; co2?: string[]; appliances?: Appliance[]; warnings?: string[]; co2_limit?: number; skipCalendars?: Set<string>; hidden?: string[] } = {},
): EventSources | undefined {
  const hide = opts.hide ?? {}
  const off = (key: EventKey) => opts.hidden?.includes(key)
  const ids = entityIndex(hass, hide.labels).all.filter(id => !hide.entities?.includes(id) && hass.states[id])
  const calendars = hide.domains?.includes('calendar') ? [] : ids.filter(id => domainOf(id) === 'calendar' && !opts.skipCalendars?.has(id))
  const parcels = calendars.filter(id => PARCEL.test(`${id} ${entityName(hass.states[id])}`))
  const out: EventSources = {
    waste: off('waste') ? [] : ids.filter(id => isWasteSensor(hass, id)),
    warnings: off('warning') ? [] : opts.warnings?.length ? opts.warnings.filter(id => hass.states[id]) : ids.filter(id => isCurrentWarning(hass, id)),
    co2: off('co2') ? [] : opts.co2 ?? [],
    birthdays: off('birthday') ? [] : calendars.filter(id => !parcels.includes(id)),
    parcels: off('parcel') ? [] : parcels,
    appliances: off('appliance') ? [] : opts.appliances ?? [],
  }
  const kept = Object.fromEntries(Object.entries(out).filter(([, v]) => Array.isArray(v) && v.length)) as EventSources
  if (!Object.keys(kept).length) return undefined
  return { ...kept, ...(kept.co2 && opts.co2_limit ? { co2_limit: opts.co2_limit } : {}) }
}

/** CO₂ sensors in ppm among the given entities */
export const co2Sensors = (hass: HomeAssistant, ids: string[]) =>
  ids.filter(id => domainOf(id) === 'sensor' && hass.states[id]?.attributes.device_class === 'carbon_dioxide' && hass.states[id]?.attributes.unit_of_measurement === 'ppm')

// ── What to show now ─────────────────────────────────────

const midnight = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}
const addDays = (ms: number, n: number) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** The bin chip shows from 15:00 the day before until 9:00 on the day */
const WASTE_FROM_H = 15
const WASTE_UNTIL_H = 9

export interface Pickup {
  day: 'today' | 'tomorrow'
  bins: { name: string; entity: string }[]
}

const cleanBin = (name: string) => name.replace(/^waste collection schedule\s*/i, '').trim()

/** The next collection whose window is open now, with every bin going out that day */
export function wastePickup(hass: HomeAssistant, ids: string[] = [], now: number): Pickup | undefined {
  const today = midnight(now)
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60
  const day = hour < WASTE_UNTIL_H ? today : hour >= WASTE_FROM_H ? addDays(today, 1) : undefined
  if (day === undefined) return undefined
  const bins: Pickup['bins'] = []
  for (const id of ids) {
    const e = hass.states[id]
    if (!e) continue
    const dated = Object.entries(e.attributes).filter(([k]) => DATE_KEY.test(k))
    const names = dated.length
      ? dated.filter(([k]) => dayOf(k) === day).flatMap(([, v]) => String(v).split(/\s*,\s*/))
      : typeof e.attributes.daysTo === 'number' && addDays(today, e.attributes.daysTo) === day ? [cleanBin(entityName(e))] : []
    for (const name of names) if (name && !bins.some(b => b.name === name)) bins.push({ name, entity: id })
  }
  return bins.length ? { day: day === today ? 'today' : 'tomorrow', bins } : undefined
}

/** A bin's colour as German households know them; others stay neutral */
export function binColor(name: string): string | undefined {
  const n = name.toLowerCase()
  if (/gelb|yellow|wertstoff|verpack|plastic|plastik/.test(n)) return '#facc15'
  if (/bio|organic|kompost|garden|grün|green waste/.test(n)) return '#a16207'
  if (/papier|paper|pappe|karton|blau|blue/.test(n)) return '#3b82f6'
  if (/glas|glass/.test(n)) return '#22c55e'
  if (/rest|grau|gray|grey|schwarz|black|general|haus/.test(n)) return '#9ca3af'
  return undefined
}

export interface CalendarHit {
  calendar: string
  title: string
}

const BIRTHDAY = /geburtstag|birthday|compleanno|cumpleaños|anniversaire|verjaardag|🎂/i

/** Who has a birthday, from event titles like "Geburtstag Margit", "Margit's birthday" or "🎂 Margit" */
export function birthdayName(title: string): string | undefined {
  if (!BIRTHDAY.test(title)) return undefined
  const name = title
    .replace(/🎂|🎉|🥳/g, ' ')
    .replace(/\b(geburtstag|birthday|compleanno|cumpleaños|anniversaire|verjaardag)\b/gi, ' ')
    .replace(/(^|\s)(von|of|di|de|van|hat|has|happy|alles gute zum)(?=\s|$)/gi, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/[-–—:|(),!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name || undefined
}

/** Today's birthdays from the calendars' events, each name once */
export function birthdays(hits: CalendarHit[]): string[] {
  return [...new Set(hits.map(h => birthdayName(h.title)).filter((n): n is string => !!n))]
}

export interface Co2Room {
  entity: string
  value: number
  area?: string
}

/** Rooms whose CO₂ is at or above the limit, the worst first */
export function stuffyRooms(hass: HomeAssistant, ids: string[] = [], limit = CO2_LIMIT): Co2Room[] {
  return ids
    .map(id => ({ entity: id, value: Number(hass.states[id]?.state), area: hass.areas[entityAreaId(hass, id) ?? '']?.name }))
    .filter(r => Number.isFinite(r.value) && r.value >= limit)
    .sort((a, b) => b.value - a.value)
}

/** Appliances that finished and wait to be emptied */
export const finishedAppliances = (hass: HomeAssistant, list: Appliance[] = []) => list.filter(a => appliancePhase(hass, a) === 'finished')

export const applianceChipIcon = (list: Appliance[]) => applianceIcon(list[0]?.kind ?? 'appliance')

/** Warnings that are still on, the most severe first, each headline once */
export function currentWarnings(hass: HomeAssistant, ids: string[] = [], now: number) {
  const seen = new Set<string>()
  return activeWarnings(hass, ids)
    .filter(w => !w.until || !(Date.parse(w.until) <= now))
    .filter(w => !seen.has(w.headline) && !!seen.add(w.headline))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/** "FROST", "Amtliche WARNUNG vor FROST" → "Frost" */
export function warningName(w: { headline: string; name?: string }): string {
  const raw = (w.name ?? w.headline.replace(/^.*\b(warnung vor|warning of|warning for)\s+/i, '')).trim()
  return raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])\p{L}/gu, s => s.toUpperCase()) : raw
}
