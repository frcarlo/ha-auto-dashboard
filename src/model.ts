// Pure functions that turn the HA registries into rooms, groups and counts.
import type { AreaRegistryEntry, FloorRegistryEntry, HassEntity, HomeAssistant, StrategyConfig } from './types'
import { OPENING_CLASSES, deviceClassOf, domainOf, isActive } from './presentation'

export const HIDE_LABEL = 'ad_hide'

/** What the dashboard leaves out besides hidden and diagnostic entities. */
export interface Hide {
  domains?: string[]
  /** Label ids; an entity is left out when it, its device or its area carries one */
  labels?: string[]
}

export type GroupKey =
  | 'light' | 'climate' | 'shading' | 'opening' | 'gate' | 'lock' | 'media' | 'switch'
  | 'select' | 'motion' | 'safety' | 'sensor' | 'scene'

/** Order in which groups appear on a room page. */
export const GROUP_ORDER: GroupKey[] = [
  'light', 'climate', 'shading', 'opening', 'gate', 'lock', 'media', 'switch', 'select', 'motion', 'safety', 'sensor', 'scene',
]

/** Groups the security page collects. */
export const SECURITY_GROUPS: GroupKey[] = ['opening', 'gate', 'lock', 'motion', 'safety']

const GROUP_BY_DOMAIN: Record<string, GroupKey> = {
  light: 'light',
  climate: 'climate',
  humidifier: 'climate',
  media_player: 'media',
  switch: 'switch',
  fan: 'switch',
  input_boolean: 'switch',
  vacuum: 'switch',
  lock: 'lock',
  alarm_control_panel: 'safety',
  select: 'select',
  input_select: 'select',
  scene: 'scene',
  script: 'scene',
  sensor: 'sensor',
}

const BINARY_GROUPS: Record<string, GroupKey> = {
  door: 'opening', window: 'opening', opening: 'opening',
  garage_door: 'gate', gate: 'gate',
  motion: 'motion', moving: 'motion', occupancy: 'motion', presence: 'motion',
  smoke: 'safety', gas: 'safety', carbon_monoxide: 'safety', moisture: 'safety', safety: 'safety',
  tamper: 'safety', problem: 'safety', heat: 'safety', cold: 'safety',
}

/**
 * Covers by what they do, so "all down" for blinds never moves the garage door:
 * windows and doors, gates (garage, gate), and shading (blinds, shutters, awnings, covers without a class).
 */
export function coverKind(entity: HassEntity): 'shading' | 'opening' | 'gate' {
  const deviceClass = deviceClassOf(entity) ?? ''
  if (['door', 'window'].includes(deviceClass)) return 'opening'
  if (['garage', 'gate'].includes(deviceClass)) return 'gate'
  return 'shading'
}

export function groupOf(entity: HassEntity): GroupKey | undefined {
  const domain = domainOf(entity.entity_id)
  if (domain === 'binary_sensor') return BINARY_GROUPS[deviceClassOf(entity) ?? '']
  if (domain === 'cover') return coverKind(entity)
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

const indexCache = new WeakMap<object, Map<string, Index>>()

/** The entity's own area, falling back to its device's area. */
export function entityAreaId(hass: HomeAssistant, entityId: string): string | undefined {
  const entry = hass.entities[entityId]
  if (!entry) return undefined
  return entry.area_id ?? (entry.device_id ? hass.devices[entry.device_id]?.area_id ?? undefined : undefined)
}

/** Whether the entity, its device or its area carries one of the labels. */
function labelled(hass: HomeAssistant, entityId: string, labels: string[]) {
  const entry = hass.entities[entityId]
  const has = (own?: string[]) => !!own?.some(l => labels.includes(l))
  return has(entry?.labels) || has(hass.devices[entry?.device_id ?? '']?.labels) || has(hass.areas[entityAreaId(hass, entityId) ?? '']?.labels)
}

/**
 * Entities that should show up anywhere, keyed by area. Area comes from the entity,
 * falling back to its device. Cached per registry object and label set, so cheap to call on every render.
 * States are looked up later, so entities without a state yet simply drop out.
 */
export function entityIndex(hass: HomeAssistant, hideLabels: string[] = []): Index {
  const labels = [HIDE_LABEL, ...hideLabels]
  const key = labels.join('\n')
  let byLabels = indexCache.get(hass.entities)
  if (!byLabels) indexCache.set(hass.entities, (byLabels = new Map()))
  const cached = byLabels.get(key)
  if (cached) return cached

  const byArea = new Map<string, string[]>()
  const all: string[] = []
  for (const entry of Object.values(hass.entities)) {
    if (entry.hidden || entry.entity_category || labelled(hass, entry.entity_id, labels)) continue
    all.push(entry.entity_id)
    const areaId = entityAreaId(hass, entry.entity_id)
    if (!areaId) continue
    const list = byArea.get(areaId)
    if (list) list.push(entry.entity_id)
    else byArea.set(areaId, [entry.entity_id])
  }
  const index = { byArea, all }
  byLabels.set(key, index)
  return index
}

export function areaEntities(hass: HomeAssistant, areaId: string, hide: Hide = {}): HassEntity[] {
  return (entityIndex(hass, hide.labels).byArea.get(areaId) ?? [])
    .filter(id => !hide.domains?.includes(domainOf(id)))
    .map(id => hass.states[id]!)
    .filter(Boolean)
}

/** All visible entities, or only those in the given areas when a filter is set. */
export function allEntities(hass: HomeAssistant, hide: Hide = {}, areaIds?: string[]): HassEntity[] {
  if (areaIds) return areaIds.flatMap(id => areaEntities(hass, id, hide))
  return entityIndex(hass, hide.labels).all
    .filter(id => !hide.domains?.includes(domainOf(id)))
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
export function floorsWithAreas(
  hass: HomeAssistant,
  config: Pick<StrategyConfig, 'hide_areas' | 'area_order' | 'hide_domains' | 'hide_labels' | 'areas' | 'floors'> = {},
): FloorGroup[] {
  const order = config.area_order ?? []
  const rank = (area: AreaRegistryEntry) => {
    const i = order.indexOf(area.area_id)
    return i === -1 ? order.length : i
  }
  const areas = Object.values(hass.areas)
    .filter(area => !config.areas?.length || config.areas.includes(area.area_id))
    .filter(area => !config.floors?.length || config.floors.includes(area.floor_id ?? ''))
    .filter(area => !config.hide_areas?.includes(area.area_id))
    .filter(area => areaEntities(hass, area.area_id, { domains: config.hide_domains, labels: config.hide_labels }).some(e => groupOf(e)))
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

/** Sensors chosen for the area in HA win over the first matching sensor in the room. */
export function roomSummary(entities: HassEntity[], area?: AreaRegistryEntry, states?: Record<string, HassEntity>): RoomSummary {
  const picked = (id?: string | null) => (id ? states?.[id] : undefined)
  const status = [
    ...entities.filter(e => domainOf(e.entity_id) === 'binary_sensor' && OPENING_CLASSES.includes(deviceClassOf(e) ?? '')),
    ...entities.filter(e => domainOf(e.entity_id) === 'lock'),
    ...entities.filter(e => domainOf(e.entity_id) === 'media_player').slice(0, 1),
  ]
  return {
    lights: entities.filter(e => domainOf(e.entity_id) === 'light'),
    climate: entities.find(e => domainOf(e.entity_id) === 'climate'),
    temperature: picked(area?.temperature_entity_id) ?? firstSensor(entities, 'temperature'),
    humidity: picked(area?.humidity_entity_id) ?? firstSensor(entities, 'humidity'),
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
export function batteryEntities(hass: HomeAssistant, areaIds?: string[], hideLabels: string[] = []): HassEntity[] {
  const labels = [HIDE_LABEL, ...hideLabels]
  return Object.values(hass.states).filter(e =>
    domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === 'battery' && !hass.entities[e.entity_id]?.hidden &&
    !labelled(hass, e.entity_id, labels) &&
    (!areaIds || areaIds.includes(entityAreaId(hass, e.entity_id) ?? '')))
}

/**
 * One entity per device that is gone: every visible entity of the device is unavailable.
 * Only devices and entities placed in an area count, so leftovers without a room don't add noise.
 * Entities without a device count on their own.
 */
export function unavailableDevices(hass: HomeAssistant, hide: Hide = {}, areaIds?: string[]): HassEntity[] {
  const byDevice = new Map<string, HassEntity[]>()
  const loose: HassEntity[] = []
  for (const [areaId, ids] of entityIndex(hass, hide.labels).byArea) {
    if (areaIds && !areaIds.includes(areaId)) continue
    for (const id of ids) {
      const entity = hass.states[id]
      if (!entity || hide.domains?.includes(domainOf(id))) continue
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

export type QuickKey = 'light' | 'switch' | 'shading' | 'opening' | 'gate'

const isDomain = (...domains: string[]) => (e: HassEntity) => domains.includes(domainOf(e.entity_id))
const isCover = (kind: ReturnType<typeof coverKind>) => (e: HassEntity) => domainOf(e.entity_id) === 'cover' && coverKind(e) === kind

const QUICK: Record<QuickKey, (e: HassEntity) => boolean> = {
  light: isDomain('light'),
  switch: isDomain('switch', 'fan', 'input_boolean'),
  shading: isCover('shading'),
  opening: isCover('opening'),
  gate: isCover('gate'),
}

/** Entities a room can switch together: lights, switches, and each kind of cover on its own. Empty groups are left out. */
export function quickGroups(entities: HassEntity[]): { key: QuickKey; entities: HassEntity[] }[] {
  return (Object.keys(QUICK) as QuickKey[])
    .map(key => ({ key, entities: entities.filter(QUICK[key]) }))
    .filter(group => group.entities.length)
}

/** Picked favorites that exist and lie in the dashboard's rooms; favorites without a room always count. */
export function favoriteEntities(hass: HomeAssistant, ids: string[] = [], areaIds?: string[]): HassEntity[] {
  return ids
    .map(id => hass.states[id])
    .filter((e): e is HassEntity => !!e)
    .filter(e => {
      const area = entityAreaId(hass, e.entity_id)
      return !areaIds || !area || areaIds.includes(area)
    })
}

/** The scene row on Home: the picked scenes and scripts, else every visible scene by name. */
export function sceneEntities(hass: HomeAssistant, ids: string[] | undefined, hide: Hide = {}, areaIds?: string[]): HassEntity[] {
  if (ids?.length) return favoriteEntities(hass, ids, areaIds).filter(e => ['scene', 'script'].includes(domainOf(e.entity_id)))
  return allEntities(hass, hide, areaIds).filter(e => domainOf(e.entity_id) === 'scene').sort(byName)
}

export type GroupControl = 'toggle' | 'cover' | 'lock'

/**
 * The bulk control for a group heading and the entities it acts on: on/off for lights and switches,
 * up/down for covers, lock/unlock for the locks among other security entities.
 * A single entity gets none; its own tile already has the control.
 */
export function bulkControl(entities: HassEntity[]): { control?: GroupControl; entities: HassEntity[] } {
  const domains = new Set(entities.map(e => domainOf(e.entity_id)))
  const many = (list: HassEntity[]) => list.length > 1
  if (!many(entities)) return { entities }
  if ([...domains].every(d => ['light', 'switch', 'fan', 'input_boolean'].includes(d))) return { control: 'toggle', entities }
  if (domains.size === 1 && domains.has('cover') && new Set(entities.map(coverKind)).size === 1) return { control: 'cover', entities }
  const locks = entities.filter(e => domainOf(e.entity_id) === 'lock')
  if (many(locks) && [...domains].every(d => ['lock', 'binary_sensor', 'alarm_control_panel'].includes(d))) return { control: 'lock', entities: locks }
  return { entities }
}
