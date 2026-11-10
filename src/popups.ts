// Popups: "when this happens, show that". A rule names a trigger (the doorbell's visitor sensor); when it fires,
// every open dashboard shows a window with the camera beside it and buttons for the door. Camera and buttons are
// found from the trigger's device and room when the rule doesn't name them.
import { detectionKind, findCameras } from './cameras'
import { deviceEntities, entityAreaId } from './model'
import { domainOf, entityName } from './presentation'
import type { HassEntity, HomeAssistant, PopupRule } from './types'

/** A rule with everything filled in, as the popup element gets it */
export interface Popup {
  trigger: string
  title: string
  camera?: string
  actions: string[]
  /** Seconds the window stays after the trigger fired; it stays longer while the trigger is still on */
  close_after: number
  /** The state that fires it; event entities fire on every new event */
  to: string
}

export const CLOSE_AFTER = 60

/** lock.open, the Nuki's "unlatch" and the Nuki Opener's buzzer */
const LOCK_OPEN = 1

const GONE = ['unknown', 'unavailable']

const deviceOf = (hass: HomeAssistant, entityId: string) => hass.entities[entityId]?.device_id ?? undefined

/** The camera for a trigger: the trigger's own device's best picture, else the one camera in its room. */
export function cameraFor(hass: HomeAssistant, trigger: string): string | undefined {
  const device = deviceOf(hass, trigger)
  const own = device ? deviceEntities(hass, device).filter(e => domainOf(e.entity_id) === 'camera') : []
  if (own.length) return findCameras(hass, own)[0]?.entity
  const area = entityAreaId(hass, trigger)
  if (!area) return undefined
  const inRoom = Object.values(hass.states).filter(e => domainOf(e.entity_id) === 'camera' && entityAreaId(hass, e.entity_id) === area && !hass.entities[e.entity_id]?.hidden)
  const found = findCameras(hass, inRoom)
  return found.length === 1 ? found[0]!.entity : undefined
}

/** The locks for a trigger: those in its room, else the only lock in the house. */
export function actionsFor(hass: HomeAssistant, trigger: string): string[] {
  const usable = (e: HassEntity) => domainOf(e.entity_id) === 'lock' && !hass.entities[e.entity_id]?.hidden && !hass.entities[e.entity_id]?.entity_category
  const locks = Object.values(hass.states).filter(usable)
  const area = entityAreaId(hass, trigger)
  const inRoom = area ? locks.filter(e => entityAreaId(hass, e.entity_id) === area) : []
  if (inRoom.length) return inRoom.map(e => e.entity_id)
  return locks.length === 1 ? [locks[0]!.entity_id] : []
}

/** The trigger's device name ("Türklingel"), else the trigger's own name */
function titleFor(hass: HomeAssistant, trigger: string) {
  const device = hass.devices[deviceOf(hass, trigger) ?? '']
  const name = device?.name_by_user ?? device?.name
  if (name) return name
  const entity = hass.states[trigger]
  return entity ? entityName(entity) : trigger
}

/** The rules as written, filled in from the trigger's device and room. Rules without a trigger are left out. */
export function resolvePopups(hass: HomeAssistant, rules: PopupRule[] | undefined): Popup[] {
  return (rules ?? []).filter(rule => rule?.trigger).map(rule => {
    const camera = rule.camera ?? cameraFor(hass, rule.trigger)
    const after = Number(rule.close_after)
    return {
      trigger: rule.trigger,
      title: rule.title?.trim() || titleFor(hass, rule.trigger),
      ...(camera ? { camera } : {}),
      actions: rule.actions ?? actionsFor(hass, rule.trigger),
      close_after: Number.isFinite(after) && after > 0 ? after : CLOSE_AFTER,
      to: rule.to ?? 'on',
    }
  })
}

const isEvent = (entityId: string) => domainOf(entityId) === 'event'

/**
 * Whether the trigger fired between two states. Only a change seen while the dashboard is open counts:
 * a page opened while the bell is still on shows nothing.
 */
export function fired(popup: Pick<Popup, 'trigger' | 'to'>, before: HassEntity | undefined, now: HassEntity | undefined) {
  if (!before || !now || before === now || GONE.includes(now.state)) return false
  // An event entity's state is the time of its last event
  if (isEvent(popup.trigger)) return now.state !== before.state
  return now.state === popup.to && before.state !== popup.to
}

/** The trigger still says someone is there; the window doesn't close on its own then */
export function stillOn(popup: Pick<Popup, 'trigger' | 'to'>, now: HassEntity | undefined) {
  return !!now && !isEvent(popup.trigger) && now.state === popup.to
}

export type LockButton = 'open' | 'unlock' | 'lock'

/** The buttons a lock gets: open the door where it can, and unlock or lock depending on its state. */
export function lockButtons(entity: HassEntity | undefined): LockButton[] {
  if (!entity || GONE.includes(entity.state)) return []
  const open = (Number(entity.attributes.supported_features) & LOCK_OPEN) ? ['open' as const] : []
  const turn: LockButton = entity.state === 'locked' || entity.state === 'locking' ? 'unlock' : 'lock'
  return [...open, turn]
}

/** Buttons that ask once more before they act: opening the door and unlocking it */
export const ASKS: LockButton[] = ['open', 'unlock']

/** Doorbells in the house, to offer as a ready rule: a visitor sensor or doorbell event on a device with a camera */
export function findDoorbells(hass: HomeAssistant): string[] {
  const out: string[] = []
  for (const [id, device] of Object.entries(hass.devices)) {
    const own = deviceEntities(hass, id)
    if (!own.some(e => domainOf(e.entity_id) === 'camera')) continue
    const names = [device.name_by_user, device.name].filter((n): n is string => !!n)
    const ring = own.find(e => !hass.entities[e.entity_id]?.entity_category && detectionKind(e, names) === 'visitor')
    if (ring) out.push(ring.entity_id)
  }
  return out
}
