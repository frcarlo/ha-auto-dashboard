// Port of HArmony's useEntityPresentation.ts: icons, active state and colors per entity.
import type { HassEntity } from './types'

type MinimalEntity = Pick<HassEntity, 'entity_id' | 'state' | 'attributes'>
export type StateColor = 'muted' | 'primary' | 'warning' | 'error' | 'info' | 'success'

const BINARY_SENSOR_ICONS: Record<string, [string, string]> = {
  battery: ['mdi:battery-alert-variant-outline', 'mdi:battery-check-outline'],
  cold: ['mdi:snowflake-alert', 'mdi:snowflake'],
  connectivity: ['mdi:lan-disconnect', 'mdi:lan-connect'],
  door: ['mdi:door-open', 'mdi:door-closed'],
  garage_door: ['mdi:garage-open-variant', 'mdi:garage-variant'],
  gas: ['mdi:gas-cylinder', 'mdi:gas-cylinder'],
  heat: ['mdi:fire-alert', 'mdi:fire'],
  light: ['mdi:brightness-7', 'mdi:brightness-5'],
  lock: ['mdi:lock-open-alert-outline', 'mdi:lock-check-outline'],
  moisture: ['mdi:water-alert-outline', 'mdi:water-check-outline'],
  motion: ['mdi:motion-sensor', 'mdi:motion-sensor-off'],
  occupancy: ['mdi:account-check', 'mdi:account-outline'],
  opening: ['mdi:door-open', 'mdi:door-closed'],
  plug: ['mdi:power-plug', 'mdi:power-plug-off-outline'],
  power: ['mdi:power-plug', 'mdi:power-plug-off-outline'],
  presence: ['mdi:home-account', 'mdi:home-outline'],
  problem: ['mdi:alert-circle-outline', 'mdi:check-circle-outline'],
  safety: ['mdi:shield-alert-outline', 'mdi:shield-check-outline'],
  smoke: ['mdi:smoke-detector-alert', 'mdi:smoke-detector-outline'],
  sound: ['mdi:volume-high', 'mdi:volume-off'],
  tamper: ['mdi:shield-alert-outline', 'mdi:shield-check-outline'],
  vibration: ['mdi:vibrate', 'mdi:vibrate-off'],
  window: ['mdi:window-open-variant', 'mdi:window-closed-variant'],
}

const SENSOR_ICONS: Record<string, string> = {
  apparent_power: 'mdi:flash-triangle-outline',
  atmospheric_pressure: 'mdi:gauge',
  battery: 'mdi:battery',
  carbon_dioxide: 'mdi:molecule-co2',
  carbon_monoxide: 'mdi:molecule-co',
  current: 'mdi:current-ac',
  data_rate: 'mdi:speedometer',
  data_size: 'mdi:database',
  distance: 'mdi:ruler',
  duration: 'mdi:timer-outline',
  energy: 'mdi:lightning-bolt',
  frequency: 'mdi:sine-wave',
  gas: 'mdi:gas-cylinder',
  humidity: 'mdi:water-percent',
  illuminance: 'mdi:brightness-5',
  irradiance: 'mdi:solar-power-variant-outline',
  moisture: 'mdi:water-percent',
  monetary: 'mdi:cash',
  pm1: 'mdi:air-filter',
  pm10: 'mdi:air-filter',
  pm25: 'mdi:air-filter',
  power: 'mdi:flash',
  power_factor: 'mdi:angle-acute',
  precipitation: 'mdi:weather-rainy',
  precipitation_intensity: 'mdi:weather-pouring',
  pressure: 'mdi:gauge',
  signal_strength: 'mdi:wifi-strength-3',
  sound_pressure: 'mdi:volume-high',
  speed: 'mdi:speedometer',
  temperature: 'mdi:thermometer',
  volatile_organic_compounds: 'mdi:air-filter',
  volatile_organic_compounds_parts: 'mdi:air-filter',
  voltage: 'mdi:sine-wave',
  volume: 'mdi:cube-outline',
  water: 'mdi:water',
  weight: 'mdi:weight',
  wind_speed: 'mdi:weather-windy',
}

export const HVAC_ICONS: Record<string, string> = {
  heat: 'mdi:fire', cool: 'mdi:snowflake', auto: 'mdi:thermostat-auto',
  heat_cool: 'mdi:thermometer', fan_only: 'mdi:fan', dry: 'mdi:water-percent', off: 'mdi:power',
}

export function hvacColor(mode: string): StateColor {
  if (mode === 'heat') return 'warning'
  if (mode === 'cool') return 'info'
  if (mode === 'auto' || mode === 'heat_cool') return 'primary'
  return 'muted'
}

export const domainOf = (entityId: string) => entityId.split('.')[0] ?? ''
export const deviceClassOf = (entity?: MinimalEntity) => entity?.attributes?.device_class as string | undefined
export const isUnavailable = (entity?: MinimalEntity) => !entity || entity.state === 'unavailable' || entity.state === 'unknown'

export function isActive(entity: MinimalEntity | undefined, activeState?: string) {
  if (!entity) return false
  const state = entity.state
  if (activeState) return state === activeState
  const domain = domainOf(entity.entity_id)
  if (domain === 'lock') return state === 'locked'
  if (domain === 'cover') return ['open', 'opening'].includes(state)
  if (domain === 'media_player') return state === 'playing'
  if (domain === 'climate') return !['off', 'unavailable', 'unknown'].includes(state)
  if (domain === 'alarm_control_panel') return ['triggered', 'pending', 'arming', 'armed_home', 'armed_away', 'armed_night'].includes(state)
  return state === 'on'
}

export function entityName(entity: MinimalEntity | undefined, fallback = '') {
  return (entity?.attributes?.friendly_name as string | undefined) ?? (fallback || entity?.entity_id || '')
}

/** Strip the area name from an entity name ("Wohnzimmer Decke" → "Decke") for use inside a room. */
export function shortName(name: string, areaName?: string) {
  if (!areaName) return name
  const stripped = name.replace(new RegExp(`^${areaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').trim()
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : name
}

function binarySensorIcon(entity: MinimalEntity | undefined, active: boolean) {
  const pair = BINARY_SENSOR_ICONS[deviceClassOf(entity) ?? '']
  if (pair) return active ? pair[0] : pair[1]
  return active ? 'mdi:checkbox-marked-circle-outline' : 'mdi:checkbox-blank-circle-outline'
}

function sensorIcon(entity: MinimalEntity | undefined) {
  const deviceClass = deviceClassOf(entity)
  if (deviceClass && SENSOR_ICONS[deviceClass]) return SENSOR_ICONS[deviceClass]
  const unit = entity?.attributes?.unit_of_measurement as string | undefined
  if (unit === '%') return 'mdi:percent-outline'
  if (unit === '°C' || unit === '°F') return 'mdi:thermometer'
  if (unit === 'W' || unit === 'kW') return 'mdi:flash'
  if (unit === 'Wh' || unit === 'kWh') return 'mdi:lightning-bolt'
  return 'mdi:gauge'
}

export function entityIcon(entity: MinimalEntity | undefined, active = isActive(entity)) {
  if (!entity) return 'mdi:help-circle-outline'
  const domain = domainOf(entity.entity_id)
  if (domain === 'binary_sensor') return binarySensorIcon(entity, active)
  if (domain === 'sensor') return sensorIcon(entity)
  if (domain === 'climate') return HVAC_ICONS[entity.state] ?? 'mdi:thermostat'
  if (domain === 'switch' && deviceClassOf(entity) === 'outlet') return active ? 'mdi:power-plug' : 'mdi:power-plug-off-outline'
  const pair = DOMAIN_ICONS[domain]
  if (pair) return active ? pair[0] : pair[1]
  return active ? 'mdi:circle' : 'mdi:circle-outline'
}

const DOMAIN_ICONS: Record<string, [string, string]> = {
  alarm_control_panel: ['mdi:shield-alert', 'mdi:shield-home-outline'],
  automation: ['mdi:robot', 'mdi:robot-off-outline'],
  button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'],
  input_button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'],
  camera: ['mdi:camera', 'mdi:camera-off-outline'],
  cover: ['mdi:window-shutter-open', 'mdi:window-shutter'],
  fan: ['mdi:fan', 'mdi:fan-off'],
  humidifier: ['mdi:air-humidifier', 'mdi:air-humidifier-off'],
  input_boolean: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'],
  light: ['mdi:lightbulb', 'mdi:lightbulb-outline'],
  lock: ['mdi:lock', 'mdi:lock-open-variant-outline'],
  media_player: ['mdi:play-circle', 'mdi:pause-circle-outline'],
  person: ['mdi:account', 'mdi:account-outline'],
  remote: ['mdi:remote', 'mdi:remote-off'],
  scene: ['mdi:palette-outline', 'mdi:palette-outline'],
  script: ['mdi:script-text-outline', 'mdi:script-text-outline'],
  siren: ['mdi:bullhorn', 'mdi:bullhorn-outline'],
  switch: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'],
  update: ['mdi:package-up', 'mdi:package-check'],
  vacuum: ['mdi:robot-vacuum', 'mdi:robot-vacuum-off'],
  weather: ['mdi:weather-partly-cloudy', 'mdi:weather-partly-cloudy'],
}

const ALERT_CLASSES = ['battery', 'problem', 'safety', 'smoke', 'moisture', 'gas', 'heat', 'tamper']
export const OPENING_CLASSES = ['door', 'garage_door', 'opening', 'window']

export function stateColor(entity: MinimalEntity | undefined, active = isActive(entity)): StateColor {
  if (!entity || !active) return 'muted'
  const domain = domainOf(entity.entity_id)
  if (domain === 'binary_sensor') {
    const deviceClass = deviceClassOf(entity) ?? ''
    if (ALERT_CLASSES.includes(deviceClass)) return 'error'
    if (OPENING_CLASSES.includes(deviceClass)) return 'warning'
  }
  if (domain === 'climate') return hvacColor(entity.state)
  if (domain === 'light') return 'warning'
  if (domain === 'update') return 'info'
  if (domain === 'alarm_control_panel') return 'error'
  return 'primary'
}
