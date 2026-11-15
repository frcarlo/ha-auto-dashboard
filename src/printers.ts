// Printers for the maintenance page: what is left in their cartridges and of their wear parts, from any
// integration that reports it in percent. Brother names its sensors "Cyan-Toner" or "Lebensdauer Cyan-Trommel",
// IPP (most inkjets, HP, Epson, Canon) marks its cartridges with a marker_type and a level that counts as low.
import type { HassEntity, HomeAssistant } from './types'
import { HIDE_LABEL, entityAreaId, labelled } from './model'
import { deviceClassOf, domainOf } from './presentation'

export type InkColor = 'black' | 'cyan' | 'magenta' | 'yellow' | 'other'

export interface Consumable {
  entity: HassEntity
  /** Percent left */
  level: number
  color: InkColor
  /** Percent from which it counts as low: the printer's own word where it gives one */
  low: number
}

export interface Printer {
  deviceId: string
  name: string
  model?: string
  areaId?: string
  /** What the printer is doing: idle, printing, out of paper */
  status?: HassEntity
  /** Problems that are on now: paper jam, cover open, no paper */
  problems: HassEntity[]
  /** Toner and ink, black first */
  supplies: Consumable[]
  /** Parts that wear out: drums, belt, fuser, paper feed */
  parts: Consumable[]
}

/** Below this a cartridge or part counts as low when the printer doesn't say */
export const LOW_SUPPLY = 10

const SUPPLY = /(^|[\s_-])(toner|ink|inks|tinte|patrone|druckpatrone|cartridge|ink-cartridge|toner-cartridge)([\s_-]|$)/i
const PART = /(^|[\s_-])(trommel|drum|opc|fuser|fixiereinheit|bandeinheit|belt|transfer|pf[\s_-]?kit|waste|resttintenbehälter|wartungsbox|maintenance[\s_-]?box)([\s_-]|$)/i
const COLORS: [InkColor, RegExp][] = [
  ['black', /(^|[\s_-])(black|schwarz|bk|pgbk|k)([\s_-]|$)/i],
  ['cyan', /cyan/i],
  ['magenta', /magenta/i],
  ['yellow', /(^|[\s_-])(yellow|gelb|y)([\s_-]|$)/i],
]
const ORDER: InkColor[] = ['black', 'cyan', 'magenta', 'yellow', 'other']

/** The words of an entity that tell what it measures */
function wordsOf(hass: HomeAssistant, e: HassEntity) {
  const reg = hass.entities[e.entity_id]
  return [reg?.translation_key, e.entity_id.split('.')[1], e.attributes.friendly_name, e.attributes.marker_type].filter(Boolean).join(' ').replace(/_/g, ' ')
}

export function inkColor(words: string): InkColor {
  return COLORS.find(([, re]) => re.test(words))?.[0] ?? 'other'
}

/** The printers that report a cartridge level in percent, each with its supplies, parts, status and problems */
export function printers(hass: HomeAssistant, areaIds?: string[], hideLabels: string[] = [], hideEntities: string[] = []): Printer[] {
  const labels = [HIDE_LABEL, ...hideLabels]
  const byDevice = new Map<string, Printer>()
  const printer = (deviceId: string) => {
    let p = byDevice.get(deviceId)
    if (!p) {
      const d = hass.devices[deviceId]
      p = { deviceId, name: d?.name_by_user ?? d?.name ?? deviceId, model: d?.model ?? undefined, areaId: d?.area_id ?? undefined, problems: [], supplies: [], parts: [] }
      byDevice.set(deviceId, p)
    }
    return p
  }
  const parts: [string, Consumable][] = []
  for (const e of Object.values(hass.states)) {
    const reg = hass.entities[e.entity_id]
    if (domainOf(e.entity_id) !== 'sensor' || !reg?.device_id || reg.hidden || e.attributes.unit_of_measurement !== '%') continue
    if (labelled(hass, e.entity_id, labels) || hideEntities.includes(e.entity_id)) continue
    if (areaIds && !areaIds.includes(entityAreaId(hass, e.entity_id) ?? '')) continue
    const level = Number(e.state)
    if (!Number.isFinite(level)) continue
    const words = wordsOf(hass, e)
    const ownLow = Number(e.attributes.marker_low_level)
    const item: Consumable = { entity: e, level, color: inkColor(words), low: Number.isFinite(ownLow) && ownLow > 0 ? ownLow : LOW_SUPPLY }
    // A waste tank or drum the printer lists among its markers is a part, not a cartridge
    if (PART.test(words)) parts.push([reg.device_id, item])
    else if (SUPPLY.test(words)) printer(reg.device_id).supplies.push(item)
  }
  // Wear parts only of devices that turned out to be printers: a drum alone could be a washing machine's
  for (const [deviceId, item] of parts) byDevice.get(deviceId)?.parts.push(item)

  for (const p of byDevice.values()) {
    p.supplies.sort((a, b) => ORDER.indexOf(a.color) - ORDER.indexOf(b.color))
    p.parts.sort((a, b) => ORDER.indexOf(a.color) - ORDER.indexOf(b.color))
    const own = Object.values(hass.states).filter(e => hass.entities[e.entity_id]?.device_id === p.deviceId)
    // The printer's state: an enum sensor, the one named after printing first (Brother has a device state too)
    const states = own.filter(e => domainOf(e.entity_id) === 'sensor' && deviceClassOf(e) === 'enum')
    p.status = states.find(e => /print|druck/i.test(wordsOf(hass, e))) ?? states[0]
      ?? own.find(e => domainOf(e.entity_id) === 'sensor' && hass.entities[e.entity_id]?.translation_key === 'status')
    p.problems = own.filter(e => domainOf(e.entity_id) === 'binary_sensor' && deviceClassOf(e) === 'problem' && e.state === 'on')
  }
  return [...byDevice.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.model ?? '').localeCompare(b.model ?? ''))
}

/** The lowest supply first, for a quick word of what to buy */
export function lowSupplies(printer: Printer): Consumable[] {
  return [...printer.supplies, ...printer.parts].filter(c => c.level <= c.low)
}
