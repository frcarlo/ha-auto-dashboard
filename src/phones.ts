// A person's phones, tablets and watches from the Companion app, with what each one reports: battery, charging,
// where it is, the next alarm, steps, the network. Android and iOS name their sensors differently, so each reading
// lists the names of both; whatever a device doesn't report is left out.
import { domainOf } from './presentation'
import type { HassEntity, HomeAssistant } from './types'

export type PhoneKind = 'phone' | 'tablet' | 'watch'

/** A reading and the sensor names (without the device's prefix) that report it, the most telling first */
const READINGS = {
  battery: ['battery_level'],
  battery_state: ['battery_state'],
  charger: ['charger_type'],
  charging: ['is_charging'],
  health: ['battery_health'],
  cycles: ['battery_cycle_count'],
  location: ['geocoded_location'],
  alarm: ['next_alarm'],
  steps: ['daily_steps', 'health_steps', 'steps'],
  activity: ['detected_activity', 'activity'],
  wifi: ['wifi_connection', 'ssid'],
  network: ['network_type', 'connection_type'],
  storage: ['storage'],
  os: ['os_version'],
  app: ['app_version'],
} as const

export type Reading = keyof typeof READINGS

export interface Phone {
  device_id: string
  name: string
  kind: PhoneKind
  tracker: string
  /** Entity per reading the device reports */
  readings: Partial<Record<Reading, string>>
  /** Every entity of the device, for re-rendering */
  entities: string[]
}

/** The device's entities per device id, built once per entity registry */
const byDevice = new WeakMap<object, Map<string, string[]>>()

function deviceEntities(hass: HomeAssistant, deviceId: string): string[] {
  let index = byDevice.get(hass.entities)
  if (!index) {
    index = new Map()
    for (const entry of Object.values(hass.entities)) {
      if (!entry.device_id) continue
      const list = index.get(entry.device_id)
      if (list) list.push(entry.entity_id)
      else index.set(entry.device_id, [entry.entity_id])
    }
    byDevice.set(hass.entities, index)
  }
  return index.get(deviceId) ?? []
}

export function phoneKind(name: string, model = ''): PhoneKind {
  const text = `${name} ${model}`
  if (/watch|wear/i.test(text)) return 'watch'
  if (/tablet|ipad|\btab\b|sm-[xtp]\d|23073rp/i.test(text)) return 'tablet'
  return 'phone'
}

/** The sensor's own name after the device's prefix, without the _2 HA adds to a taken entity id */
const suffixOf = (entityId: string) => entityId.split('.')[1]!.replace(/_\d+$/, '')

/** The Companion app devices behind a person's trackers, in the person's order */
export function personPhones(hass: HomeAssistant, person: HassEntity | undefined): Phone[] {
  const trackers: string[] = Array.isArray(person?.attributes.device_trackers) ? person!.attributes.device_trackers : []
  const out: Phone[] = []
  for (const tracker of trackers) {
    const entry = hass.entities[tracker]
    if (!entry?.device_id || entry.platform !== 'mobile_app' || out.some(p => p.device_id === entry.device_id)) continue
    const device = hass.devices[entry.device_id]
    const entities = deviceEntities(hass, entry.device_id).filter(id => hass.entities[id]?.platform === 'mobile_app')
    const readings: Phone['readings'] = {}
    for (const [reading, names] of Object.entries(READINGS) as [Reading, readonly string[]][]) {
      const domain = reading === 'charging' ? 'binary_sensor' : 'sensor'
      for (const name of names) {
        const id = entities.find(e => domainOf(e) === domain && suffixOf(e).endsWith(`_${name}`) && hass.states[e])
        if (id) { readings[reading] = id; break }
      }
    }
    const name = device?.name_by_user || device?.name || hass.states[tracker]?.attributes.friendly_name || tracker
    out.push({ device_id: entry.device_id, name, kind: phoneKind(name, device?.model ?? ''), tracker, readings, entities })
  }
  return out
}

const usable = (e?: HassEntity) => !!e && e.state !== 'unavailable' && e.state !== 'unknown' && e.state !== ''

/** A reading's state, or nothing when the device doesn't report it right now */
export function readingOf(hass: HomeAssistant, phone: Phone, reading: Reading): HassEntity | undefined {
  const e = hass.states[phone.readings[reading] ?? '']
  return usable(e) ? e : undefined
}

/** Charging, on Android from is_charging or the battery state, on iOS from "Charging" or "Full" */
export function isCharging(hass: HomeAssistant, phone: Phone): boolean {
  const flag = readingOf(hass, phone, 'charging')
  if (flag) return flag.state === 'on'
  const state = readingOf(hass, phone, 'battery_state')?.state.toLowerCase() ?? ''
  return state === 'charging' || state === 'full'
}

export function batteryLevel(hass: HomeAssistant, phone: Phone): number | undefined {
  const n = Number(readingOf(hass, phone, 'battery')?.state)
  return Number.isFinite(n) ? n : undefined
}

/** When the device last reported anything */
export function lastSeen(hass: HomeAssistant, phone: Phone): number | undefined {
  const times = phone.entities
    .map(id => Date.parse(String(hass.states[id]?.last_updated ?? hass.states[id]?.last_changed ?? '')))
    .filter(Number.isFinite)
  return times.length ? Math.max(...times) : undefined
}

/** Where it is: home, a zone, or the street address the app looked up; nothing while the tracker doesn't know */
export function phonePlace(hass: HomeAssistant, phone: Phone): { zone: 'home' | 'away' | 'zone'; text?: string } | undefined {
  const tracker = hass.states[phone.tracker]
  const address = readingOf(hass, phone, 'location')?.state
  if (!usable(tracker)) return address && address !== 'Home' ? { zone: 'away', text: address } : undefined
  if (tracker!.state === 'home') return { zone: 'home' }
  if (tracker!.state === 'not_home') return { zone: 'away', ...(address ? { text: address } : {}) }
  return { zone: 'zone', text: hass.formatEntityState?.(tracker!) ?? tracker!.state }
}
