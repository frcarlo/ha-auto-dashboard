// Cameras, one per device. A doorbell brings several camera entities (sub stream, main stream, snapshots);
// the page wants one picture of it, and the detections the device reports beside: person, vehicle, animal,
// package, a ring at the door, plain motion.
import { allEntities, areaEntities, deviceEntities, entityAreaId, type Hide } from './model'
import { domainOf, entityName } from './presentation'
import type { HassEntity, HomeAssistant } from './types'

export type DetectionKind = 'visitor' | 'package' | 'person' | 'vehicle' | 'animal' | 'motion'

export interface CameraInfo {
  /** The camera entity the picture comes from */
  entity: string
  name: string
  area?: string
  /** Detection sensors of the same device, with what each one sees */
  detections?: { entity: string; kind: DetectionKind }[]
  /** Lights at the camera: its own floodlight first, then the lights of its room */
  lights?: string[]
}

const text = (e: HassEntity) => `${e.entity_id} ${entityName(e)}`.toLowerCase()

/** Snapshots and screenshots are stills, not a view; they only stand in when a device has nothing else */
const isStill = (e: HassEntity) => /snapshot|schnappsch|screenshot|still/.test(text(e))

/** The sub stream loads fast on a wall tablet; the main stream is for the detail view's own player */
function pictureScore(e: HassEntity) {
  const words = text(e)
  return (isStill(e) ? -10 : 0)
    + (/standard|sub\b|_sub|fluent|ausgewogen|balanced|live/.test(words) ? 2 : 0)
    + (/hoch|main|high|clear/.test(words) ? 1 : 0)
}

/** How HA turns a name into an entity id: "Türklingel" becomes "turklingel" */
const slug = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * What a sensor detects, from its own words. The device name comes off first: on a doorbell named "Türklingel"
 * every sensor is called "Türklingel …", and its motion sensor is no ring at the door.
 */
export function detectionKind(e: HassEntity, deviceNames: string[] = []): DetectionKind | undefined {
  const domain = domainOf(e.entity_id)
  let words = text(e)
  for (const name of deviceNames.flatMap(n => [n.toLowerCase(), slug(n)])) if (name) words = words.split(name).join(' ')
  if (domain === 'event') return e.attributes.device_class === 'doorbell' || /klingel|doorbell|ring|besucher|visitor/.test(words) ? 'visitor' : undefined
  if (domain !== 'binary_sensor') return undefined
  // A camera's binary sensors also say whether it sleeps, was tampered with or runs low
  if (/schlaf|sleep|manipulation|tamper|batter|privacy|privat|online|connect/.test(words)) return undefined
  if (['battery', 'tamper', 'connectivity', 'problem', 'update'].includes(e.attributes.device_class)) return undefined
  if (/besucher|visitor|klingel|doorbell|\bring/.test(words)) return 'visitor'
  if (/paket|package|parcel/.test(words)) return 'package'
  if (/person|people|mensch|face|gesicht/.test(words)) return 'person'
  if (/fahrzeug|vehicle|auto\b|car\b/.test(words)) return 'vehicle'
  if (/tier|animal|pet\b|hund|katze|dog|cat\b/.test(words)) return 'animal'
  if (/beweg|motion/.test(words) || ['motion', 'occupancy', 'presence', 'moving'].includes(e.attributes.device_class)) return 'motion'
  return undefined
}

/** Detections first by how much they tell: a ring beats a package beats a person beats plain motion */
export const DETECTION_RANK: Record<DetectionKind, number> = { visitor: 6, package: 5, person: 4, vehicle: 3, animal: 2, motion: 1 }

export const DETECTION_ICON: Record<DetectionKind, string> = {
  visitor: 'mdi:doorbell', package: 'mdi:package-variant-closed', person: 'mdi:account', vehicle: 'mdi:car', animal: 'mdi:paw', motion: 'mdi:motion-sensor',
}

/** One camera per device, from the cameras the dashboard shows, with its detections and the lights beside it. */
export function findCameras(hass: HomeAssistant, cameras: HassEntity[], hide: Hide = {}): CameraInfo[] {
  const groups = new Map<string, HassEntity[]>()
  for (const camera of cameras) {
    const key = hass.entities[camera.entity_id]?.device_id ?? camera.entity_id
    groups.set(key, [...(groups.get(key) ?? []), camera])
  }
  const visible = new Set(allEntities(hass, hide).map(e => e.entity_id))
  return [...groups.entries()].map(([key, list]) => {
    const best = [...list].sort((a, b) => pictureScore(b) - pictureScore(a))[0]!
    const device = hass.devices[key]
    const name = (device?.name_by_user ?? device?.name ?? entityName(best)).replace(/\s*\([^)]*\)\s*$/, '').trim()
    // Both names of the device: what the user called it shows in the entity names, what it called itself in the ids
    const deviceNames = [device?.name_by_user, device?.name].filter((n): n is string => !!n)
    const area = entityAreaId(hass, best.entity_id)
    const own = device ? deviceEntities(hass, key) : []
    // Detection sensors may well be hidden from the rooms; they still say what the camera saw
    const detections = own
      .map(e => ({ entity: e.entity_id, kind: detectionKind(e, deviceNames) }))
      .filter((d): d is { entity: string; kind: DetectionKind } => !!d.kind && !hass.entities[d.entity]?.entity_category)
    const lights = [
      ...own.filter(e => domainOf(e.entity_id) === 'light' && visible.has(e.entity_id)),
      ...(area ? areaEntities(hass, area, hide).filter(e => domainOf(e.entity_id) === 'light' && !own.includes(e)) : []),
    ].slice(0, 3).map(e => e.entity_id)
    return {
      entity: best.entity_id,
      name,
      ...(area ? { area } : {}),
      ...(detections.length ? { detections } : {}),
      ...(lights.length ? { lights } : {}),
    }
  })
}

export interface Detection {
  camera: string
  kind: DetectionKind
  at: number
}

/** History rows as HA's websocket sends them: s is the state, lu when it was last updated (seconds) */
type Row = { s: string; lu?: number; lc?: number }

/**
 * Detections from the sensors' history: each switch to "on" (or each new event) counts once. Plain motion right
 * beside a more telling detection on the same camera says nothing new, and a person standing at the door for
 * a while is one detection, not five.
 */
export function detectionsFrom(history: Record<string, Row[]>, cameras: CameraInfo[], since: number): Detection[] {
  const raw: Detection[] = []
  for (const camera of cameras) {
    for (const d of camera.detections ?? []) {
      const rows = history[d.entity] ?? []
      let before: string | undefined
      for (const [i, row] of rows.entries()) {
        const at = (row.lu ?? row.lc ?? 0) * 1000
        const event = d.entity.startsWith('event.')
        // The first row is the state the day began with, not something that happened today
        const fired = i > 0 && (event ? !['unknown', 'unavailable'].includes(row.s) : row.s === 'on' && before !== 'on')
        before = row.s
        if (fired && at >= since) raw.push({ camera: camera.entity, kind: d.kind, at })
      }
    }
  }
  raw.sort((a, b) => a.at - b.at)
  const kept: Detection[] = []
  for (const d of raw) {
    const near = (o: Detection, ms: number) => o.camera === d.camera && Math.abs(o.at - d.at) <= ms
    if (kept.some(o => near(o, 120_000) && o.kind === d.kind)) continue
    if (d.kind === 'motion' && raw.some(o => near(o, 60_000) && o.kind !== 'motion')) continue
    // A detection that tells more replaces the motion just before it
    const motion = kept.findIndex(o => near(o, 60_000) && o.kind === 'motion')
    if (motion >= 0 && d.kind !== 'motion') kept.splice(motion, 1)
    kept.push(d)
  }
  return kept.sort((a, b) => b.at - a.at)
}
