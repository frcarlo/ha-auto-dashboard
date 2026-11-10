// Pure functions that turn the HA registries into rooms, groups and counts.
import type { AreaRegistryEntry, FloorRegistryEntry, GroupKey, HassEntity, HomeAssistant, RoomSettings, StrategyConfig, StatusChip, EventKey } from './types'
import { OPENING_CLASSES, deviceClassOf, domainOf, entityName, isActive } from './presentation'

export const HIDE_LABEL = 'ad_hide'

/** What the dashboard leaves out besides hidden and diagnostic entities. */
export interface Hide {
  domains?: string[]
  /** Label ids; an entity is left out when it, its device or its area carries one */
  labels?: string[]
  /** Single entities hidden in the room settings */
  entities?: string[]
}

/** The hide options as cards and the strategy config carry them. */
export interface HideOptions {
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

export const hideOf = (c: HideOptions): Hide => ({ domains: c.hide_domains, labels: c.hide_labels, entities: c.hide_entities })

const shown = (hide: Hide) => (id: string) => !hide.domains?.includes(domainOf(id)) && !hide.entities?.includes(id)

export type { GroupKey } from './types'

/** Order in which groups appear on a room page. */
export const GROUP_ORDER: GroupKey[] = [
  'light', 'climate', 'shading', 'awning', 'opening', 'gate', 'lock', 'media', 'outlet', 'switch', 'select', 'motion', 'safety', 'sensor', 'scene', 'button',
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
  button: 'button',
  input_button: 'button',
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
 * Covers by what they do, so "all down" for blinds never moves the garage door or rolls out the awning:
 * windows and doors, gates (garage, gate), awnings, and shading (blinds, shutters, covers without a class).
 * Awning drives often come in as shutters (Shelly does this), so the name counts too.
 */
export function coverKind(entity: HassEntity): 'shading' | 'awning' | 'opening' | 'gate' {
  const deviceClass = deviceClassOf(entity) ?? ''
  if (['door', 'window'].includes(deviceClass)) return 'opening'
  if (['garage', 'gate'].includes(deviceClass)) return 'gate'
  if (deviceClass === 'awning' || /markise|awning/i.test(entityName(entity))) return 'awning'
  return 'shading'
}

export const isAwning = (entity: HassEntity) => domainOf(entity.entity_id) === 'cover' && coverKind(entity) === 'awning'

/**
 * Buttons that keep a device running rather than do something in the room: identify, restart, update, calibrate,
 * "battery replaced", caches. Integrations often leave them without a category, so the name decides.
 */
const MAINTENANCE_BUTTON = /identif|reboot|neu ?start|restart|batter(y|ie)|calibrat|kalibrier|platform api|favorisier|purge|cache|firmware|update|aktualisier|screenshot|snapshot|selbsttest|self[ _-]?test|report|ignore|ignorier/i

export function isMaintenanceButton(entity: HassEntity) {
  if (['restart', 'update', 'identify'].includes(deviceClassOf(entity) ?? '')) return true
  return MAINTENANCE_BUTTON.test(`${entity.entity_id} ${entity.attributes.friendly_name ?? ''}`)
}

export function groupOf(entity: HassEntity): GroupKey | undefined {
  const domain = domainOf(entity.entity_id)
  if ((domain === 'button' || domain === 'input_button') && isMaintenanceButton(entity)) return undefined
  if (domain === 'binary_sensor') return BINARY_GROUPS[deviceClassOf(entity) ?? '']
  if (domain === 'cover') return coverKind(entity)
  // Sockets are devices of their own on a room page, apart from switches that are device settings
  if (isOutlet(entity)) return 'outlet'
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

/** A word for a screen in a light's id or name: "Wandtablet Screen", light.tv_backlight, "Display Helligkeit". */
const SCREEN_WORDS = /(^|[\s_.-])(screen|bildschirm|display|backlight|hintergrundbeleuchtung)([\s_.-]|$)/i

/**
 * A tablet's or display's brightness that its integration reports as a light (ESPHome, Fully Kiosk and others).
 * It's a device setting, not a lamp: it stays out of the lights, their counts and "all off".
 */
export function isScreenLight(hass: HomeAssistant, entityId: string) {
  if (domainOf(entityId) !== 'light') return false
  const name = hass.entities[entityId]?.name ?? hass.states[entityId]?.attributes.friendly_name ?? ''
  return SCREEN_WORDS.test(entityId) || SCREEN_WORDS.test(String(name))
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
  // A wall tablet's or display's own buttons (reload page, next slide, close overlays) go with its screen
  const screens = new Set(Object.values(hass.entities).filter(e => isScreenLight(hass, e.entity_id)).map(e => e.device_id).filter(Boolean))
  for (const entry of Object.values(hass.entities)) {
    if (entry.hidden || entry.entity_category || labelled(hass, entry.entity_id, labels) || isScreenLight(hass, entry.entity_id)) continue
    if (domainOf(entry.entity_id) === 'button' && entry.device_id && screens.has(entry.device_id)) continue
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
    .filter(shown(hide))
    .map(id => hass.states[id]!)
    .filter(Boolean)
}

/** All visible entities, or only those in the given areas when a filter is set. */
export function allEntities(hass: HomeAssistant, hide: Hide = {}, areaIds?: string[]): HassEntity[] {
  if (areaIds) return areaIds.flatMap(id => areaEntities(hass, id, hide))
  return entityIndex(hass, hide.labels).all
    .filter(shown(hide))
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
  config: Pick<StrategyConfig, 'hide_areas' | 'area_order' | 'hide_domains' | 'hide_labels' | 'hide_entities' | 'areas' | 'floors'> = {},
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
    .filter(area => areaEntities(hass, area.area_id, hideOf(config)).some(e => groupOf(e)))
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

/** A room's temperature or humidity and where it comes from (tap opens that entity). */
export interface Reading {
  entity: HassEntity
  value: number
  unit: string
}

export interface RoomSummary {
  lights: HassEntity[]
  climate?: HassEntity
  temperature?: Reading
  humidity?: Reading
  co2?: HassEntity
  status: HassEntity[]
}

const firstSensor = (entities: HassEntity[], deviceClass: string) =>
  entities.find(e => domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === deviceClass)

function sensorReading(entity: HassEntity | undefined, fallbackUnit: string): Reading | undefined {
  const value = Number(entity?.state)
  if (!entity || entity.state === '' || !Number.isFinite(value)) return undefined
  return { entity, value, unit: String(entity.attributes.unit_of_measurement ?? fallbackUnit) }
}

function climateReading(climates: HassEntity[], attribute: string, unit: string): Reading | undefined {
  for (const entity of climates) {
    const value = Number(entity.attributes[attribute])
    if (entity.attributes[attribute] !== undefined && entity.attributes[attribute] !== null && Number.isFinite(value)) return { entity, value, unit }
  }
  return undefined
}

/**
 * The room's temperature and humidity: the sensors picked for the area in HA, else what the thermostat measures,
 * else the first working sensor. The thermostat comes before loose sensors, which may sit in a fridge or outside.
 */
export function roomSummary(entities: HassEntity[], area?: AreaRegistryEntry, states?: Record<string, HassEntity>): RoomSummary {
  const picked = (id?: string | null) => (id ? states?.[id] : undefined)
  const climates = entities.filter(e => domainOf(e.entity_id) === 'climate')
  const firstWorking = (deviceClass: string, unit: string) => entities
    .filter(e => domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === deviceClass)
    .map(e => sensorReading(e, unit)).find(Boolean)
  const status = [
    ...entities.filter(e => domainOf(e.entity_id) === 'binary_sensor' && OPENING_CLASSES.includes(deviceClassOf(e) ?? '')),
    ...entities.filter(e => domainOf(e.entity_id) === 'lock'),
    ...entities.filter(e => domainOf(e.entity_id) === 'media_player').slice(0, 1),
  ]
  return {
    lights: entities.filter(e => domainOf(e.entity_id) === 'light'),
    climate: entities.find(e => domainOf(e.entity_id) === 'climate'),
    temperature: sensorReading(picked(area?.temperature_entity_id), '°C') ?? climateReading(climates, 'current_temperature', '°C') ?? firstWorking('temperature', '°C'),
    humidity: sensorReading(picked(area?.humidity_entity_id), '%') ?? climateReading(climates, 'current_humidity', '%') ?? firstWorking('humidity', '%'),
    co2: firstSensor(entities, 'carbon_dioxide'),
    status: status.slice(0, 5),
  }
}

export type StatusKey = Exclude<StatusChip, 'school' | EventKey>

export interface StatusItem {
  key: StatusKey
  entities: HassEntity[]
}

export const LOW_BATTERY = 20

/** Battery sensors are usually diagnostic entities, so they are not in the index. */
export function batteryEntities(hass: HomeAssistant, areaIds?: string[], hideLabels: string[] = [], hideEntities: string[] = []): HassEntity[] {
  const labels = [HIDE_LABEL, ...hideLabels]
  return Object.values(hass.states).filter(e =>
    domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === 'battery' && !hass.entities[e.entity_id]?.hidden &&
    !labelled(hass, e.entity_id, labels) && !hideEntities.includes(e.entity_id) &&
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
      if (!entity || !shown(hide)(id)) continue
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

/** The device's name for an entity, as people know it; falls back to the entity name. */
export function deviceName(hass: HomeAssistant, entity: HassEntity) {
  const device = hass.devices[hass.entities[entity.entity_id]?.device_id ?? '']
  return device?.name_by_user ?? device?.name ?? String(entity.attributes.friendly_name ?? entity.entity_id)
}

/** Things worth a glance on the home page. Only non-empty items are returned. */
/** Sensors that say someone is there: motion, and presence or occupancy (mmWave radar and the like) */
export const PRESENCE_CLASSES = ['motion', 'moving', 'occupancy', 'presence']

/**
 * What is going on, for the status chips. Presence only on request: in one room it says someone is there,
 * across the house every hallway sensor would count.
 */
export function homeStatus(entities: HassEntity[], batteries: HassEntity[] = [], unavailable: HassEntity[] = [], options: { presence?: boolean } = {}): StatusItem[] {
  const is = (domain: string) => (e: HassEntity) => domainOf(e.entity_id) === domain
  const items: StatusItem[] = [
    ...(options.presence ? [{
      key: 'presence' as const,
      entities: entities.filter(is('binary_sensor')).filter(e => PRESENCE_CLASSES.includes(deviceClassOf(e) ?? '') && e.state === 'on'),
    }] : []),
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

export type QuickKey = 'light' | 'switch' | 'shading' | 'awning' | 'opening' | 'gate'

const isDomain = (...domains: string[]) => (e: HassEntity) => domains.includes(domainOf(e.entity_id))

/**
 * A socket: a switch with the device class outlet, or one named like a socket or plug. Whatever hangs on it
 * (a fridge, a computer, a router) must not lose power by a stray tap, so switching one off asks first.
 */
export function isOutlet(e: HassEntity, hass?: HomeAssistant) {
  if (domainOf(e.entity_id) !== 'switch') return false
  // A plug's settings are switches too: child lock, overheat alert, cloud connection, its LED
  if (hass?.entities[e.entity_id]?.entity_category) return false
  if (deviceClassOf(e) === 'outlet') return true
  const words = `${e.entity_id} ${e.attributes.friendly_name ?? ''}`
  if (PLUG_SETTING.test(words)) return false
  return /steckdose|zwischenstecker|socket|outlet|plug/i.test(words)
}

/** Switches on a plug that set it up rather than switch the power */
const PLUG_SETTING = /kindersicherung|child[_ ]?lock|overheat|overtemp|[ _]internet|cloud|[ _]led\b|indicator|restart|reboot/i

/**
 * What may be switched together: lights, fans and sockets. Other switches are often device settings
 * (child lock, eco mode of a dishwasher) that must not flip with "all off".
 */
export function bulkSwitchable(e: HassEntity) {
  const domain = domainOf(e.entity_id)
  return domain === 'light' || domain === 'fan' || isOutlet(e)
}

/** What a measuring socket reports about the power through it */
const SOCKET_READINGS = ['power', 'energy', 'voltage', 'current', 'frequency', 'power_factor', 'apparent_power', 'reactive_power']

export interface SocketReading {
  /** Current power in watts */
  power?: string
  /** Energy counter */
  energy?: string
  /** All the socket's own measurements, shown with the socket instead of under Sensors */
  readings: string[]
}

/**
 * Sockets with their own measurements, by switch: a plug reports power, energy, voltage and current as sensors
 * of its device. The tile shows the power, and the room page leaves the single readings out. A power strip
 * with several switches on one device keeps its readings apart, as they belong to the whole strip.
 */
export function socketReadings(hass: HomeAssistant): Map<string, SocketReading> {
  const byDevice = new Map<string, string[]>()
  for (const entry of Object.values(hass.entities)) {
    if (entry.device_id) byDevice.set(entry.device_id, [...(byDevice.get(entry.device_id) ?? []), entry.entity_id])
  }
  const out = new Map<string, SocketReading>()
  for (const ids of byDevice.values()) {
    const states = ids.map(id => hass.states[id]).filter((e): e is HassEntity => !!e)
    const outlets = states.filter(e => isOutlet(e, hass))
    if (outlets.length !== 1) continue
    const sensors = states.filter(e => domainOf(e.entity_id) === 'sensor' && SOCKET_READINGS.includes(deviceClassOf(e) ?? ''))
    if (!sensors.length) continue
    const ofClass = (c: string) => sensors.find(e => deviceClassOf(e) === c)?.entity_id
    out.set(outlets[0]!.entity_id, {
      ...(ofClass('power') ? { power: ofClass('power') } : {}),
      ...(ofClass('energy') ? { energy: ofClass('energy') } : {}),
      readings: sensors.map(e => e.entity_id),
    })
  }
  return out
}
const isCover = (kind: ReturnType<typeof coverKind>) => (e: HassEntity) => domainOf(e.entity_id) === 'cover' && coverKind(e) === kind

const QUICK: Record<QuickKey, (e: HassEntity) => boolean> = {
  light: isDomain('light'),
  switch: e => bulkSwitchable(e) && domainOf(e.entity_id) !== 'light',
  shading: isCover('shading'),
  awning: isCover('awning'),
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
/** A favorite naming a room instead of a device: entity ids always have a dot, area ids never. */
export const isRoomFavorite = (id: string) => !id.includes('.')

/**
 * Replaces the rooms (or the devices) among the favorites with a new list, keeping the other kind where it was:
 * an editor with one picker per kind still keeps the user's order.
 */
export function replaceFavorites(list: string[], rooms: boolean, next: string[]): string[] {
  const queue = [...next]
  const kept = list.flatMap(id => isRoomFavorite(id) !== rooms ? [id] : queue.length ? [queue.shift()!] : [])
  return [...kept, ...queue]
}

export function favoriteEntities(hass: HomeAssistant, ids: string[] = [], areaIds?: string[]): HassEntity[] {
  return ids
    .filter(id => !isRoomFavorite(id))
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

export type GroupControl = 'toggle' | 'cover' | 'awning' | 'lock'

/**
 * The bulk control for a group heading and the entities it acts on: on/off for lights and switches,
 * up/down for covers, out/in for awnings, lock/unlock for the locks among other security entities.
 * A single entity gets none; its own tile already has the control.
 */
export function bulkControl(entities: HassEntity[]): { control?: GroupControl; entities: HassEntity[] } {
  const domains = new Set(entities.map(e => domainOf(e.entity_id)))
  const many = (list: HassEntity[]) => list.length > 1
  if (!many(entities)) return { entities }
  if (entities.every(bulkSwitchable)) return { control: 'toggle', entities }
  // A switch group with sockets among settings: the sockets alone
  const sockets = entities.filter(bulkSwitchable)
  if (many(sockets) && [...domains].every(d => ['switch', 'fan', 'input_boolean'].includes(d))) return { control: 'toggle', entities: sockets }
  if (domains.size === 1 && domains.has('cover') && new Set(entities.map(coverKind)).size === 1) {
    return { control: isAwning(entities[0]!) ? 'awning' : 'cover', entities }
  }
  const locks = entities.filter(e => domainOf(e.entity_id) === 'lock')
  if (many(locks) && [...domains].every(d => ['lock', 'binary_sensor', 'alarm_control_panel'].includes(d))) return { control: 'lock', entities: locks }
  return { entities }
}

/** Current power in watts, or undefined for anything that is not a numeric power sensor. */
export function powerW(entity: HassEntity): number | undefined {
  if (domainOf(entity.entity_id) !== 'sensor' || deviceClassOf(entity) !== 'power') return undefined
  return watts(entity)
}

/** A power reading in watts from W, kW or MW. */
function watts(entity: HassEntity): number | undefined {
  const value = Number(entity.state)
  if (entity.state === '' || !Number.isFinite(value)) return undefined
  const unit = String(entity.attributes.unit_of_measurement ?? 'W')
  return unit === 'kW' ? value * 1000 : unit === 'MW' ? value * 1e6 : value
}

export const isPower = (e: HassEntity) => deviceClassOf(e) === 'power' && domainOf(e.entity_id) === 'sensor'

export interface RoomPower {
  area: AreaRegistryEntry
  total: number
  /** Biggest consumer first */
  sensors: { entity: HassEntity; watts: number }[]
}

/** Power per room, biggest room first. Rooms without a reading are left out. */
export function roomPower(hass: HomeAssistant, areas: AreaRegistryEntry[], hide: Hide = {}): RoomPower[] {
  return areas
    .map(area => {
      const sensors = areaEntities(hass, area.area_id, hide)
        .map(entity => ({ entity, watts: powerW(entity) }))
        .filter((s): s is { entity: HassEntity; watts: number } => s.watts !== undefined)
        .sort((a, b) => b.watts - a.watts)
      return { area, total: sensors.reduce((sum, s) => sum + s.watts, 0), sensors }
    })
    .filter(room => room.sensors.length)
    .sort((a, b) => b.total - a.total)
}

export interface ClimateAverage {
  temperature?: number
  humidity?: number
  unit: string
}

/** Average of the rooms' temperature and humidity, each room read as in roomSummary. */
export function averageClimate(hass: HomeAssistant, areas: AreaRegistryEntry[], hide: Hide = {}): ClimateAverage {
  const temps: number[] = []
  const hums: number[] = []
  let unit = '°C'
  for (const area of areas) {
    const s = roomSummary(areaEntities(hass, area.area_id, hide), area, hass.states)
    if (s.temperature) {
      temps.push(s.temperature.value)
      unit = s.temperature.unit
    }
    if (s.humidity) hums.push(s.humidity.value)
  }
  const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : undefined)
  return { temperature: avg(temps), humidity: avg(hums), unit }
}

/** Pending updates (firmware, add-ons, HACS). Update entities are mostly config entities, so they come from the states. */
export function pendingUpdates(hass: HomeAssistant, hideLabels: string[] = []): HassEntity[] {
  const labels = [HIDE_LABEL, ...hideLabels]
  return Object.values(hass.states).filter(e =>
    domainOf(e.entity_id) === 'update' && e.state === 'on' && !hass.entities[e.entity_id]?.hidden && !labelled(hass, e.entity_id, labels))
}

/**
 * A room page's groups after its settings: hidden groups left out, groups and entities in the chosen order.
 * Anything not in an order list keeps the default place after the ordered ones.
 */
export function arrangeRoom(groups: Map<GroupKey, HassEntity[]>, room: RoomSettings = {}): [GroupKey, HassEntity[]][] {
  const rank = <T,>(order: T[] | undefined, fallback: (x: T) => number) => (x: T) => {
    const i = order?.indexOf(x) ?? -1
    return i === -1 ? (order?.length ?? 0) + fallback(x) : i
  }
  const groupRank = rank(room.group_order, key => GROUP_ORDER.indexOf(key) / 100)
  return [...groups]
    .filter(([key]) => !room.hide_groups?.includes(key))
    .sort(([a], [b]) => groupRank(a) - groupRank(b))
    .map(([key, entities]) => {
      const order = room.order ?? []
      const pos = (e: HassEntity) => order.indexOf(e.entity_id)
      // Stable sort: unordered entities keep their name order behind the ordered ones
      return [key, [...entities].sort((a, b) => {
        const pa = pos(a), pb = pos(b)
        if (pa === -1 && pb === -1) return 0
        if (pa === -1) return 1
        if (pb === -1) return -1
        return pa - pb
      })]
    })
}

/** Power sensors from HA's energy settings (their stat_rate), by source type. */
export interface PowerSources {
  home?: string[]
  grid?: string[]
  solar?: string[]
  battery?: string[]
}

export interface EnergyPrefs {
  energy_sources?: { type: string; stat_rate?: string }[]
}

/**
 * The power sensors HA's energy settings name, keeping only those that exist. Only an unambiguous setup counts:
 * a home sensor, or exactly one grid source with a power sensor (plus solar and battery). Several grid sources
 * with power sensors are usually single plugs entered as "grid", and their sum is not the house.
 */
export function powerSources(hass: HomeAssistant, prefs: EnergyPrefs | undefined): PowerSources | undefined {
  const sources = (prefs?.energy_sources ?? []).filter(s => s.stat_rate && ['home', 'grid', 'solar', 'battery'].includes(s.type))
  // Counted before checking the sensors exist: four plugs entered as grid stay ambiguous even if three are gone
  const configured = (type: string) => sources.filter(s => s.type === type)
  const existing = (type: string) => configured(type).map(s => s.stat_rate!).filter(id => hass.states[id])
  if (existing('home').length) return { home: existing('home') }
  if (configured('grid').length !== 1 || !existing('grid').length) return undefined
  const out: PowerSources = { grid: existing('grid') }
  if (existing('solar').length) out.solar = existing('solar')
  if (existing('battery').length) out.battery = existing('battery')
  return out
}

/**
 * The house's consumption from the energy settings: the home sensor when there is one,
 * else grid (import positive) + solar + battery (discharge positive). Undefined without readings.
 */
export function housePower(hass: HomeAssistant, sources?: PowerSources) {
  if (!sources) return undefined
  const sum = (ids?: string[]) => {
    const values = (ids ?? []).map(id => hass.states[id]).filter((e): e is HassEntity => !!e).map(watts).filter((w): w is number => w !== undefined)
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined
  }
  const parts = { grid: sum(sources.grid), solar: sum(sources.solar), battery: sum(sources.battery) }
  const home = sum(sources.home)
  const flows = Object.values(parts).filter((w): w is number => w !== undefined)
  if (home === undefined && !flows.length) return undefined
  return { total: home ?? Math.max(0, flows.reduce((a, b) => a + b, 0)), ...parts }
}

export const sourceIds = (sources?: PowerSources) => Object.values(sources ?? {}).flat()
