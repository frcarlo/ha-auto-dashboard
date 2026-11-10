// Household appliances and TVs, found from their devices. A dishwasher or washing machine is a device whose
// entities include an operation state (Home Connect, WashData, Miele, ...); the card around it needs the state,
// and whatever else the device offers: progress, end time or time left, program, door, power, notices.
// A TV is a media player of class tv, with the remote on the same device for the arrow keys.
import { HIDE_LABEL, allEntities, deviceEntityIds, entityAreaId } from './model'
import { domainOf, entityName } from './presentation'
import { isMusicAssistantDashboard } from './music'
import type { ApplianceConfig, ApplianceKind, HassEntity, HomeAssistant } from './types'

export interface Appliance {
  kind: ApplianceKind
  name: string
  area?: string
  status: string
  progress?: string
  end?: string
  remaining?: string
  program?: string
  phase?: string
  door?: string
  power?: string
  /** Enum sensors that say "present" when something needs doing, like salt or rinse aid running low */
  notices?: string[]
}

export type AppliancePhase = 'unavailable' | 'off' | 'ready' | 'delayed' | 'running' | 'paused' | 'action' | 'finished' | 'error'

/** The phases a card on Home shows; idle appliances stay on their room page. */
export const ACTIVE_PHASES: AppliancePhase[] = ['delayed', 'running', 'paused', 'action', 'finished', 'error']

const STATES: Record<string, AppliancePhase> = {
  run: 'running', running: 'running', starting: 'running', ending: 'running', on: 'running', active: 'running',
  washing: 'running', rinsing: 'running', spinning: 'running', drying: 'running', cooling: 'running',
  pause: 'paused', paused: 'paused', user_paused: 'paused', interrupted: 'paused',
  delayedstart: 'delayed', delayed_start: 'delayed', delay_wait: 'delayed', delayed: 'delayed',
  actionrequired: 'action', action_required: 'action',
  finished: 'finished', anti_wrinkle: 'finished', clean: 'finished', done: 'finished', end: 'finished', complete: 'finished',
  error: 'error', aborting: 'error', force_stopped: 'error', fault: 'error', failure: 'error',
  ready: 'ready', idle: 'ready', standby: 'ready', inactive: 'off', off: 'off',
}

const KIND_ICON: Record<ApplianceKind, string> = {
  dishwasher: 'mdi:dishwasher', washer: 'mdi:washing-machine', dryer: 'mdi:tumble-dryer', oven: 'mdi:stove', appliance: 'mdi:power-plug-outline',
}
export const applianceIcon = (kind: ApplianceKind) => KIND_ICON[kind]

/** Watts above which a plug-only appliance counts as running */
const RUNNING_W = 5

const optionsOf = (e: HassEntity) => (Array.isArray(e.attributes.options) ? e.attributes.options as string[] : []).map(o => String(o).toLowerCase())
const text = (e: HassEntity) => `${e.entity_id} ${entityName(e)}`.toLowerCase()

/** An enum sensor whose options say when it runs and when it is done or ready. */
function isOperationState(e: HassEntity) {
  if (domainOf(e.entity_id) !== 'sensor' || e.attributes.device_class !== 'enum') return false
  const options = optionsOf(e)
  return options.some(o => STATES[o] === 'running') && options.some(o => ['finished', 'ready', 'idle', 'off'].includes(STATES[o] ?? o))
}

export function kindOf(words: string): ApplianceKind {
  if (/spül|spul|dishwasher|geschirr/.test(words)) return 'dishwasher'
  if (/trockner|dryer/.test(words)) return 'dryer'
  if (/wasch|washer|washing/.test(words)) return 'washer'
  if (/ofen|oven|herd|stove/.test(words)) return 'oven'
  return 'appliance'
}

/** The best entity for a role among a device's entities, or none. */
function pick(entities: HassEntity[], test: (e: HassEntity) => boolean, score: (e: HassEntity) => number = () => 0) {
  return entities.filter(test).sort((a, b) => score(b) - score(a))[0]?.entity_id
}

function rolesOf(entities: HassEntity[]): Omit<Appliance, 'kind' | 'name' | 'area' | 'status'> {
  const sensor = (e: HassEntity) => domainOf(e.entity_id) === 'sensor'
  const progress = pick(entities, e => sensor(e) && e.attributes.unit_of_measurement === '%' && /progress|fortschritt/.test(text(e)))
  const end = pick(entities, e => sensor(e) && e.attributes.device_class === 'timestamp' && /end|finish|fertig/.test(text(e)))
  const remaining = pick(entities, e => sensor(e) && e.attributes.device_class === 'duration' && /remain|verbleib|rest|left/.test(text(e)))
  // The program that runs, not the one picked for the next start
  const program = pick(entities, e => ['sensor', 'select'].includes(domainOf(e.entity_id)) && /program/.test(text(e)),
    e => (/aktiv|active/.test(text(e)) ? 3 : 0) + (sensor(e) ? 1 : 0) - (/ausgew|selected|cycle/.test(text(e)) ? 2 : 0))
  const phase = pick(entities, e => sensor(e) && /phase/.test(text(e)))
  const door = pick(entities, e =>
    (domainOf(e.entity_id) === 'binary_sensor' && e.attributes.device_class === 'door') ||
    (sensor(e) && optionsOf(e).includes('open') && optionsOf(e).includes('closed') && /door|tür|tur\b|_tur/.test(text(e))))
  const power = pick(entities, e => sensor(e) && e.attributes.device_class === 'power')
  // "Program finished" or "aborted" come as such sensors too; the state already says that
  const notices = entities
    .filter(e => sensor(e) && optionsOf(e).includes('present') && optionsOf(e).every(o => ['present', 'off', 'confirmed'].includes(o)) && !/program/.test(text(e)))
    .map(e => e.entity_id)
  return {
    ...(progress ? { progress } : {}), ...(end ? { end } : {}), ...(remaining ? { remaining } : {}), ...(program ? { program } : {}),
    ...(phase ? { phase } : {}), ...(door ? { door } : {}), ...(power ? { power } : {}), ...(notices.length ? { notices } : {}),
  }
}

/** Every entity of each device, visible or not: a progress sensor may well be a diagnostic one. */
function byDevice(hass: HomeAssistant) {
  const devices = new Map<string, HassEntity[]>()
  for (const entry of Object.values(hass.entities)) {
    const state = entry.device_id ? hass.states[entry.entity_id] : undefined
    if (!state) continue
    const list = devices.get(entry.device_id!)
    if (list) list.push(state)
    else devices.set(entry.device_id!, [state])
  }
  return devices
}

const clean = (a: Appliance): Appliance => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) as unknown as Appliance

/**
 * Appliances from the devices, plus those set up by hand under `appliances:` (a dryer on a smart plug has no
 * operation state of its own). A hand-made entry replaces what was found for the same state entity.
 */
export function findAppliances(
  hass: HomeAssistant, configured: ApplianceConfig[] = [], hide: { domains?: string[]; labels?: string[]; entities?: string[] } = {}, areaIds?: string[],
): Appliance[] {
  if (hide.domains?.includes('appliance')) return []
  const visible = new Set(allEntities(hass, hide, areaIds).map(e => e.entity_id))
  const own = configured.filter(c => c?.status && hass.states[c.status])
  const found: Appliance[] = []
  for (const [deviceId, entities] of byDevice(hass)) {
    const status = pick(entities, e => visible.has(e.entity_id) && isOperationState(e), e => (/operation|betrieb|state|zustand/.test(text(e)) ? 1 : 0))
    if (!status || own.some(c => c.status === status)) continue
    const device = hass.devices[deviceId]
    const name = device?.name_by_user ?? device?.name ?? entityName(hass.states[status]!)
    found.push(clean({
      kind: kindOf(`${name} ${device?.model ?? ''} ${entities.map(text).join(' ')}`),
      name,
      area: entityAreaId(hass, status),
      status,
      ...rolesOf(entities),
    }))
  }
  const manual = own
    .filter(c => !areaIds || areaIds.includes(c.area ?? entityAreaId(hass, c.status) ?? ''))
    .map(c => clean({
      kind: c.kind ?? kindOf(`${c.name ?? ''} ${text(hass.states[c.status]!)}`),
      name: c.name ?? entityName(hass.states[c.status]!),
      area: c.area ?? entityAreaId(hass, c.status),
      status: c.status,
      progress: c.progress, end: c.end, remaining: c.remaining, program: c.program, phase: c.phase, door: c.door, power: c.power,
      ...(c.notices?.length ? { notices: c.notices } : {}),
    }))
  return [...manual, ...found].sort((a, b) => a.name.localeCompare(b.name))
}

/** The entities a card shows, so the room page does not list them a second time. */
export function applianceEntities(hass: HomeAssistant, appliance: Appliance): string[] {
  const roles = [appliance.status, appliance.progress, appliance.end, appliance.remaining, appliance.program, appliance.phase, appliance.door,
    ...(appliance.notices ?? [])].filter((id): id is string => !!id)
  // Found ones take their whole device's read-outs along; switches and buttons of it stay on the page
  const device = hass.entities[appliance.status]?.device_id
  const readOuts = device ? deviceEntityIds(hass, device)
    .filter(id => ['sensor', 'select', 'binary_sensor'].includes(domainOf(id)) && hass.states[id]?.attributes.device_class !== 'power') : []
  return [...new Set([...roles, ...readOuts])]
}

const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s))
const meaningful = (s: string | undefined) => !!s && !['unknown', 'unavailable', 'none', 'null', 'off', '-', '—', 'auto_detect'].includes(s.toLowerCase())

/** Where the appliance stands, from its state entity; a run whose progress is full and whose power is gone has finished. */
export function appliancePhase(hass: HomeAssistant, a: Appliance): AppliancePhase {
  const status = hass.states[a.status]
  if (!status || ['unavailable', 'unknown'].includes(status.state)) return 'unavailable'
  let phase: AppliancePhase
  if (status.attributes.device_class === 'power' || status.attributes.unit_of_measurement === 'W') phase = num(status.state) >= RUNNING_W ? 'running' : 'ready'
  else if (domainOf(status.entity_id) === 'binary_sensor' || domainOf(status.entity_id) === 'switch') phase = status.state === 'on' ? 'running' : 'ready'
  else phase = STATES[status.state.toLowerCase().replace(/[\s-]+/g, '_')] ?? STATES[status.state.toLowerCase().replace(/[\s_-]+/g, '')] ?? 'ready'
  if (phase === 'running') {
    const progress = num(hass.states[a.progress ?? '']?.state)
    const power = num(hass.states[a.power ?? '']?.state)
    if (progress >= 100 && Number.isFinite(power) && power < 2) return 'finished'
  }
  return phase
}

/** Progress in percent while running, full when done, else none. */
export function applianceProgress(hass: HomeAssistant, a: Appliance, phase: AppliancePhase): number | undefined {
  if (phase === 'finished') return 100
  if (!['running', 'paused'].includes(phase)) return undefined
  const p = num(hass.states[a.progress ?? '']?.state)
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : undefined
}

const UNIT_MS: Record<string, number> = { s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 }

/** When the run ends, from the end time or the time left, and when it started, reckoned back from the progress. */
export function applianceTimes(hass: HomeAssistant, a: Appliance, now: number, progress?: number): { end?: number; start?: number } {
  let end: number | undefined
  const endState = hass.states[a.end ?? '']?.state
  if (meaningful(endState)) {
    const t = Date.parse(endState!)
    if (Number.isFinite(t) && t > now - 60_000) end = t
  }
  const left = hass.states[a.remaining ?? '']
  if (end === undefined && left && meaningful(left.state)) {
    const value = num(left.state)
    if (Number.isFinite(value) && value > 0) end = now + value * (UNIT_MS[String(left.attributes.unit_of_measurement ?? 'min')] ?? 60_000)
    else {
      // h:mm:ss, as some integrations report it
      const parts = left.state.split(':').map(Number)
      if (parts.length >= 2 && parts.every(Number.isFinite)) end = now + parts.reduce((sum, p) => sum * 60 + p, 0) * (parts.length === 3 ? 1000 : 60_000)
    }
  }
  let start: number | undefined
  if (end !== undefined && progress !== undefined && progress > 0 && progress < 100) start = end - (end - now) / ((100 - progress) / 100)
  return { ...(end !== undefined ? { end } : {}), ...(start !== undefined ? { start } : {}) }
}

/** The program as people read it: HA's translation when it has one, else the raw option tidied up. */
export function programLabel(hass: HomeAssistant, entityId: string | undefined): string | undefined {
  const e = hass.states[entityId ?? '']
  if (!e || !meaningful(e.state)) return undefined
  const formatted = hass.formatEntityState?.(e)
  if (formatted && formatted !== e.state) return formatted
  const raw = e.state.replace(/^.*program_/, '').replace(/_/g, ' ').trim()
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : undefined
}

export interface Tv {
  name: string
  area?: string
  entity: string
  remote?: string
  /** Which key names the remote understands */
  keys?: 'androidtv_remote' | 'androidtv'
  /** The same TV through other integrations, left off the room page */
  others: string[]
}

const REMOTE_RANK: Record<string, number> = { androidtv_remote: 3, androidtv: 2 }

/** TVs, one per set even when two integrations each bring a player for it (Android TV Remote and ADB). */
export function findTvs(hass: HomeAssistant, hide: { domains?: string[]; labels?: string[]; entities?: string[] } = {}, areaIds?: string[]): Tv[] {
  if (hide.domains?.includes('media_player')) return []
  const devices = byDevice(hass)
  const candidates = allEntities(hass, hide, areaIds)
    .filter(e => domainOf(e.entity_id) === 'media_player' && e.attributes.device_class === 'tv' && !isMusicAssistantDashboard(hass, e))
    .map(player => {
      const deviceId = hass.entities[player.entity_id]?.device_id
      const device = deviceId ? hass.devices[deviceId] : undefined
      const remotes = (deviceId ? devices.get(deviceId) ?? [] : []).filter(e => domainOf(e.entity_id) === 'remote' && !hass.entities[e.entity_id]?.labels?.includes(HIDE_LABEL))
      const remote = remotes.sort((a, b) => (REMOTE_RANK[hass.entities[b.entity_id]?.platform ?? ''] ?? 1) - (REMOTE_RANK[hass.entities[a.entity_id]?.platform ?? ''] ?? 1))[0]
      const platform = remote ? hass.entities[remote.entity_id]?.platform : undefined
      const name = device?.name_by_user ?? device?.name ?? entityName(player)
      return {
        player, remote, name: name.replace(/\s*\([^)]*\)\s*$/, '').trim(), area: entityAreaId(hass, player.entity_id),
        keys: platform === 'androidtv_remote' || platform === 'androidtv' ? platform as Tv['keys'] : undefined,
        rank: (REMOTE_RANK[platform ?? ''] ?? (remote ? 1 : 0)) * 10 + (player.state === 'unavailable' ? 0 : 1),
      }
    })
  const sets = new Map<string, typeof candidates>()
  for (const c of candidates) {
    const key = `${c.area ?? ''}\n${c.name.toLowerCase()}`
    sets.set(key, [...(sets.get(key) ?? []), c])
  }
  return [...sets.values()].map(set => {
    const [best, ...rest] = set.sort((a, b) => b.rank - a.rank)
    return {
      name: best!.name, entity: best!.player.entity_id,
      ...(best!.area ? { area: best!.area } : {}),
      ...(best!.remote ? { remote: best!.remote.entity_id } : {}),
      ...(best!.keys ? { keys: best!.keys } : {}),
      others: rest.flatMap(c => [c.player.entity_id, ...(c.remote ? [c.remote.entity_id] : [])]),
    }
  })
}
