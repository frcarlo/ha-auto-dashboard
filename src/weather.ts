// Weather without the card: which entity, the forecast per day, warnings from NINA or DWD, colors for temperatures.
import { domainOf } from './presentation'
import type { HassEntity, HomeAssistant, StrategyConfig, WeatherSensorKey } from './types'

/** Each measurement with the device classes a fitting sensor has, in the order the editor lists them */
export const WEATHER_SENSORS: [WeatherSensorKey, string[]][] = [
  ['temperature', ['temperature']],
  ['humidity', ['humidity']],
  ['pressure', ['atmospheric_pressure', 'pressure']],
  ['wind_speed', ['wind_speed']],
  ['wind_bearing', ['wind_direction']],
  ['rain', ['precipitation_intensity', 'precipitation']],
  ['illuminance', ['illuminance']],
]

/** The configured sensors that exist, without empty entries. */
export function weatherSensors(hass: HomeAssistant, sensors: StrategyConfig['weather_sensors']) {
  const out = Object.fromEntries(Object.entries(sensors ?? {}).filter(([, id]) => typeof id === 'string' && !!hass.states[id]))
  return Object.keys(out).length ? out as Partial<Record<WeatherSensorKey, string>> : undefined
}

/** HA's WeatherEntityFeature flags */
const DAILY = 1
const HOURLY = 2
const TWICE_DAILY = 4

export type ForecastType = 'daily' | 'twice_daily' | 'hourly'

export interface ForecastEntry {
  datetime: string
  condition?: string
  temperature?: number
  templow?: number
  precipitation_probability?: number
  is_daytime?: boolean
}

export interface ForecastDay {
  /** Local date, yyyy-mm-dd */
  date: string
  condition?: string
  high?: number
  low?: number
  precipitation_probability?: number
}

/** The configured weather entity, else the first one that forecasts by day. None when weather is hidden. */
export function weatherEntity(hass: HomeAssistant, config: Pick<StrategyConfig, 'weather_entity' | 'hide_domains' | 'hide_entities'>): string | undefined {
  if (config.hide_domains?.includes('weather')) return undefined
  if (config.weather_entity) return hass.states[config.weather_entity] ? config.weather_entity : undefined
  const all = Object.values(hass.states)
    .filter(e => domainOf(e.entity_id) === 'weather' && !config.hide_entities?.includes(e.entity_id) && !hass.entities[e.entity_id]?.hidden)
  return (all.find(e => (e.attributes.supported_features ?? 0) & DAILY) ?? all[0])?.entity_id
}

/** The finest forecast a day summary can be built from: daily, else day and night, else hourly. */
export function forecastType(entity: HassEntity | undefined): ForecastType | undefined {
  const features = Number(entity?.attributes.supported_features ?? 0)
  if (features & DAILY) return 'daily'
  if (features & TWICE_DAILY) return 'twice_daily'
  if (features & HOURLY) return 'hourly'
  return undefined
}

const localDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** One entry per day: highest and lowest temperature, the daytime condition, the highest chance of rain. */
export function forecastDays(entries: ForecastEntry[] | undefined): ForecastDay[] {
  const days = new Map<string, ForecastDay & { daytime?: boolean }>()
  for (const entry of entries ?? []) {
    if (!entry?.datetime) continue
    const date = localDate(entry.datetime)
    const day = days.get(date) ?? { date }
    const temps = [entry.temperature, entry.templow].filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    if (temps.length) {
      day.high = Math.max(day.high ?? -Infinity, ...temps)
      day.low = Math.min(day.low ?? Infinity, ...temps)
    }
    // The day's look comes from daytime, not from the night before it
    if (entry.condition && (!day.condition || (entry.is_daytime && !day.daytime))) {
      day.condition = entry.condition
      day.daytime = !!entry.is_daytime
    }
    if (typeof entry.precipitation_probability === 'number') {
      day.precipitation_probability = Math.max(day.precipitation_probability ?? 0, entry.precipitation_probability)
    }
    days.set(date, day)
  }
  return [...days.values()].map(({ daytime: _daytime, ...day }) => day)
}

export const todayDate = (now = new Date()) => localDate(now.toISOString())

export type Severity = 'warning' | 'error'

export interface Warning {
  entity_id: string
  headline: string
  severity: Severity
  /** ISO time the warning ends, when known */
  until?: string
}

const SEVERE = ['severe', 'extreme']

/**
 * Active warnings of the configured entities. NINA: a binary sensor per slot, on while it holds a warning,
 * with headline, severity and expires. DWD: a sensor counting warnings, each as warning_<n>_… attributes.
 * Anything else counts as warning while it is on or above zero, named after itself.
 */
export function activeWarnings(hass: HomeAssistant, ids: string[] | undefined): Warning[] {
  const out: Warning[] = []
  for (const id of ids ?? []) {
    const e = hass.states[id]
    if (!e) continue
    const a = e.attributes
    const count = Number(a.warning_count ?? e.state)
    if (domainOf(id) === 'sensor' && Number.isFinite(count) && a.warning_1_name !== undefined) {
      for (let n = 1; n <= count; n++) {
        const name = a[`warning_${n}_headline`] ?? a[`warning_${n}_name`]
        if (!name) continue
        out.push({ entity_id: id, headline: String(name), severity: Number(a[`warning_${n}_level`] ?? 0) >= 3 ? 'error' : 'warning', until: a[`warning_${n}_end`] })
      }
      continue
    }
    const on = e.state === 'on' || (Number.isFinite(Number(e.state)) && Number(e.state) > 0)
    if (!on) continue
    out.push({
      entity_id: id,
      headline: String(a.headline ?? a.title ?? a.friendly_name ?? id),
      severity: SEVERE.includes(String(a.severity ?? '').toLowerCase()) ? 'error' : 'warning',
      until: a.expires ?? a.end,
    })
  }
  return out
}

/** Compass point for a bearing in degrees; text bearings ("NE") pass through. */
export function compass(bearing: unknown, points: string[]): string | undefined {
  if (typeof bearing === 'string' && !Number.isFinite(Number(bearing))) return bearing
  const deg = Number(bearing)
  if (bearing === undefined || bearing === null || !Number.isFinite(deg)) return undefined
  return points[Math.round((((deg % 360) + 360) % 360) / (360 / points.length)) % points.length]
}

const ICONS: Record<string, string> = {
  'clear-night': 'mdi:weather-night',
  cloudy: 'mdi:weather-cloudy',
  exceptional: 'mdi:alert-circle-outline',
  fog: 'mdi:weather-fog',
  hail: 'mdi:weather-hail',
  lightning: 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  partlycloudy: 'mdi:weather-partly-cloudy',
  pouring: 'mdi:weather-pouring',
  rainy: 'mdi:weather-rainy',
  snowy: 'mdi:weather-snowy',
  'snowy-rainy': 'mdi:weather-snowy-rainy',
  sunny: 'mdi:weather-sunny',
  windy: 'mdi:weather-windy',
  'windy-variant': 'mdi:weather-windy-variant',
}

export const conditionIcon = (condition?: string) => ICONS[condition ?? ''] ?? 'mdi:weather-partly-cloudy'

/** Sun in amber, wet and frozen in blue, storms in amber too; clouds, fog and night stay neutral. */
export function conditionTone(condition?: string): 'sun' | 'wet' | 'storm' | '' {
  if (condition === 'sunny') return 'sun'
  if (['rainy', 'pouring', 'hail', 'snowy', 'snowy-rainy'].includes(condition ?? '')) return 'wet'
  if (condition?.startsWith('lightning')) return 'storm'
  return ''
}

/** Temperature scale in °C: blue for frost, through green, to red for heat. */
const SCALE: [number, [number, number, number]][] = [
  [-10, [96, 165, 250]],
  [0, [56, 189, 248]],
  [8, [45, 212, 191]],
  [14, [163, 230, 53]],
  [20, [250, 204, 21]],
  [26, [251, 146, 60]],
  [32, [239, 68, 68]],
]

export function temperatureColor(value: number, unit = '°C') {
  const c = /F/i.test(unit) ? (value - 32) / 1.8 : value
  const i = SCALE.findIndex(([t]) => c < t)
  if (i === 0) return `rgb(${SCALE[0]![1].join(', ')})`
  if (i === -1) return `rgb(${SCALE[SCALE.length - 1]![1].join(', ')})`
  const [t0, a] = SCALE[i - 1]!
  const [t1, b] = SCALE[i]!
  const f = (c - t0) / (t1 - t0)
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(', ')})`
}
