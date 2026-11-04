// Pure functions that turn the HA registries into rooms, groups and counts.
import type { AreaRegistryEntry, FloorRegistryEntry, HassEntity, HomeAssistant, StrategyConfig } from './types'
import { OPENING_CLASSES, deviceClassOf, domainOf, isActive } from './presentation'

export const HIDE_LABEL = 'ad_hide'

export type GroupKey = 'light' | 'climate' | 'cover' | 'media' | 'switch' | 'scene' | 'security' | 'sensor'

/** Order in which groups appear on a room page. */
export const GROUP_ORDER: GroupKey[] = ['light', 'climate', 'cover', 'media', 'switch', 'security', 'sensor', 'scene']

const GROUP_BY_DOMAIN: Record<string, GroupKey> = {
  light: 'light',
  climate: 'climate',
  humidifier: 'climate',
  cover: 'cover',
  media_player: 'media',
  switch: 'switch',
  fan: 'switch',
  input_boolean: 'switch',
  vacuum: 'switch',
  lock: 'security',
  alarm_control_panel: 'security',
  scene: 'scene',
  script: 'scene',
  sensor: 'sensor',
}

const SECURITY_CLASSES = [...OPENING_CLASSES, 'motion', 'occupancy', 'presence', 'smoke', 'moisture', 'gas', 'safety', 'tamper']

export function groupOf(entity: HassEntity): GroupKey | undefined {
  const domain = domainOf(entity.entity_id)
  if (domain === 'binary_sensor') {
    return SECURITY_CLASSES.includes(deviceClassOf(entity) ?? '') ? 'security' : undefined
  }
  if (domain === 'sensor') {
    // Plain text sensors and battery levels are noise on a room page
    if (deviceClassOf(entity) === 'battery') return undefined
    if (entity.attributes.unit_of_measurement === undefined && deviceClassOf(entity) === undefined) return undefined
  }
  return GROUP_BY_DOMAIN[domain]
}

interface Index {
  byArea: Map<string, string[]>
  all: string[]
}

const indexCache = new WeakMap<object, Index>()

/**
 * Entities that should show up anywhere, keyed by area. Area comes from the entity,
 * falling back to its device. Cached per registry object, so cheap to call on every render.
 * States are looked up later, so entities without a state yet simply drop out.
 */
export function entityIndex(hass: HomeAssistant): Index {
  const cached = indexCache.get(hass.entities)
  if (cached) return cached

  const byArea = new Map<string, string[]>()
  const all: string[] = []
  for (const entry of Object.values(hass.entities)) {
    if (entry.hidden || entry.entity_category || entry.labels?.includes(HIDE_LABEL)) continue
    all.push(entry.entity_id)
    const areaId = entry.area_id ?? (entry.device_id ? hass.devices[entry.device_id]?.area_id : undefined)
    if (!areaId) continue
    const list = byArea.get(areaId)
    if (list) list.push(entry.entity_id)
    else byArea.set(areaId, [entry.entity_id])
  }
  const index = { byArea, all }
  indexCache.set(hass.entities, index)
  return index
}

export function areaEntities(hass: HomeAssistant, areaId: string, hideDomains: string[] = []): HassEntity[] {
  return (entityIndex(hass).byArea.get(areaId) ?? [])
    .filter(id => !hideDomains.includes(domainOf(id)))
    .map(id => hass.states[id]!)
    .filter(Boolean)
}

export function allEntities(hass: HomeAssistant, hideDomains: string[] = []): HassEntity[] {
  return entityIndex(hass).all
    .filter(id => !hideDomains.includes(domainOf(id)))
    .map(id => hass.states[id]!)
    .filter(Boolean)
}

export function groupEntities(entities: HassEntity[]): Map<GroupKey, HassEntity[]> {
  const groups = new Map<GroupKey, HassEntity[]>()
  for (const entity of entities) {
    const key = groupOf(entity)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(entity)
    else groups.set(key, [entity])
  }
  for (const list of groups.values()) list.sort(byName)
  return new Map(GROUP_ORDER.filter(key => groups.has(key)).map(key => [key, groups.get(key)!]))
}

function byName(a: HassEntity, b: HassEntity) {
  return String(a.attributes.friendly_name ?? a.entity_id).localeCompare(String(b.attributes.friendly_name ?? b.entity_id))
}

export interface FloorGroup {
  floor?: FloorRegistryEntry
  areas: AreaRegistryEntry[]
}

/** Areas with at least one visible entity, grouped by floor (highest level first, as in a house). */
export function floorsWithAreas(hass: HomeAssistant, config: Pick<StrategyConfig, 'hide_areas' | 'area_order' | 'hide_domains'> = {}): FloorGroup[] {
  const order = config.area_order ?? []
  const rank = (area: AreaRegistryEntry) => {
    const i = order.indexOf(area.area_id)
    return i === -1 ? order.length : i
  }
  const areas = Object.values(hass.areas)
    .filter(area => !config.hide_areas?.includes(area.area_id))
    .filter(area => areaEntities(hass, area.area_id, config.hide_domains).some(e => groupOf(e)))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

  const floors = Object.values(hass.floors ?? {})
    .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity) || a.name.localeCompare(b.name))

  const groups: FloorGroup[] = floors
    .map(floor => ({ floor, areas: areas.filter(area => area.floor_id === floor.floor_id) }))
    .filter(group => group.areas.length)
  const floorless = areas.filter(area => !area.floor_id || !hass.floors?.[area.floor_id])
  if (floorless.length) groups.push({ areas: floorless })
  return groups
}

export interface RoomSummary {
  lights: HassEntity[]
  climate?: HassEntity
  temperature?: HassEntity
  humidity?: HassEntity
  co2?: HassEntity
  status: HassEntity[]
}

const firstSensor = (entities: HassEntity[], deviceClass: string) =>
  entities.find(e => domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === deviceClass)

export function roomSummary(entities: HassEntity[]): RoomSummary {
  const status = [
    ...entities.filter(e => domainOf(e.entity_id) === 'binary_sensor' && OPENING_CLASSES.includes(deviceClassOf(e) ?? '')),
    ...entities.filter(e => domainOf(e.entity_id) === 'lock'),
    ...entities.filter(e => domainOf(e.entity_id) === 'media_player').slice(0, 1),
  ]
  return {
    lights: entities.filter(e => domainOf(e.entity_id) === 'light'),
    climate: entities.find(e => domainOf(e.entity_id) === 'climate'),
    temperature: firstSensor(entities, 'temperature'),
    humidity: firstSensor(entities, 'humidity'),
    co2: firstSensor(entities, 'carbon_dioxide'),
    status: status.slice(0, 5),
  }
}

export type StatusKey = 'lights' | 'openings' | 'unlocked' | 'heating' | 'media' | 'battery' | 'unavailable'

export interface StatusItem {
  key: StatusKey
  entities: HassEntity[]
}

export const LOW_BATTERY = 20

/** Battery sensors are usually diagnostic entities, so they are not in the index. */
export function batteryEntities(hass: HomeAssistant): HassEntity[] {
  return Object.values(hass.states).filter(e =>
    domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === 'battery' && !hass.entities[e.entity_id]?.hidden)
}

/**
 * One entity per device that is gone: every visible entity of the device is unavailable.
 * Only devices and entities placed in an area count, so leftovers without a room don't add noise.
 * Entities without a device count on their own.
 */
export function unavailableDevices(hass: HomeAssistant, hideDomains: string[] = []): HassEntity[] {
  const byDevice = new Map<string, HassEntity[]>()
  const loose: HassEntity[] = []
  for (const ids of entityIndex(hass).byArea.values()) {
    for (const id of ids) {
      const entity = hass.states[id]
      if (!entity || hideDomains.includes(domainOf(id))) continue
      const deviceId = hass.entities[id]?.device_id
      if (!deviceId) {
        if (entity.state === 'unavailable') loose.push(entity)
        continue
      }
      const list = byDevice.get(deviceId)
      if (list) list.push(entity)
      else byDevice.set(deviceId, [entity])
    }
  }
  const dead = [...byDevice.values()]
    .filter(list => list.every(e => e.state === 'unavailable'))
    .map(list => list[0]!)
  return [...dead, ...loose]
}

/** Things worth a glance on the home page. Only non-empty items are returned. */
export function homeStatus(entities: HassEntity[], batteries: HassEntity[] = [], unavailable: HassEntity[] = []): StatusItem[] {
  const is = (domain: string) => (e: HassEntity) => domainOf(e.entity_id) === domain
  const items: StatusItem[] = [
    { key: 'lights', entities: entities.filter(is('light')).filter(e => e.state === 'on') },
    { key: 'openings', entities: entities.filter(is('binary_sensor')).filter(e => OPENING_CLASSES.includes(deviceClassOf(e) ?? '') && e.state === 'on') },
    { key: 'unlocked', entities: entities.filter(is('lock')).filter(e => ['unlocked', 'open', 'opening', 'unlocking'].includes(e.state)) },
    { key: 'heating', entities: entities.filter(is('climate')).filter(e => e.attributes.hvac_action === 'heating' || (e.attributes.hvac_action === undefined && e.state === 'heat')) },
    { key: 'media', entities: entities.filter(is('media_player')).filter(e => isActive(e)) },
    {
      key: 'battery',
      entities: batteries.filter(e => e.state !== '' && Number(e.state) < LOW_BATTERY),
    },
    { key: 'unavailable', entities: unavailable },
  ]
  return items.filter(item => item.entities.length)
}
