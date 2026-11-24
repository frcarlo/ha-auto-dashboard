// The quick search behind the magnifier in the nav bar: pages, rooms and devices by name, narrowed by kind.
// Pure functions here, the overlay is cards/spotlight.ts.
import type { HassEntity, HomeAssistant } from './types'
import { allEntities, entityAreaId, type Hide } from './model'
import { domainOf, entityName, isActive } from './presentation'

export type SearchKind = 'page' | 'room' | 'light' | 'switch' | 'cover' | 'climate' | 'media' | 'sensor' | 'scene' | 'other'

/** The chips in this order; a chip shows only when the query has hits of its kind */
export const SEARCH_KINDS: SearchKind[] = ['room', 'page', 'light', 'switch', 'cover', 'climate', 'media', 'sensor', 'scene', 'other']

export interface SearchRoom {
  id: string
  name: string
  icon?: string
  floor?: string
}

export interface SearchPage {
  path: string
  icon: string
  label: string
}

/** What the nav bar hands the overlay: the shown rooms and the dashboard's filters */
export interface SearchSettings {
  rooms: SearchRoom[]
  /** Set when the dashboard is narrowed to some rooms */
  areas?: string[]
  hide?: Hide
}

export interface SearchHit {
  kind: SearchKind
  /** Page path, area id or entity id */
  id: string
  title: string
  /** Room and floor, or what the page is */
  sub?: string
  icon?: string
  entity?: HassEntity
  score: number
}

const KIND_BY_DOMAIN: Record<string, SearchKind> = {
  light: 'light',
  switch: 'switch', input_boolean: 'switch', fan: 'switch', siren: 'switch',
  cover: 'cover', valve: 'cover',
  climate: 'climate', water_heater: 'climate', humidifier: 'climate',
  media_player: 'media', remote: 'media',
  sensor: 'sensor', binary_sensor: 'sensor', weather: 'sensor',
  scene: 'scene', script: 'scene',
}

export const kindOfEntity = (entityId: string): SearchKind => KIND_BY_DOMAIN[domainOf(entityId)] ?? 'other'

/** Lower case without accents, so "kuche" finds "Küche" and "strasse" finds "Straße" */
export function fold(text: string) {
  return text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * How well the query matches: every word must occur in the text. A title that starts with the query ranks highest,
 * then words starting a word of the title, then hits only in the room or the id. 0 = no match.
 */
export function score(query: string, title: string, rest = ''): number {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const name = fold(title)
  const all = `${name} ${fold(rest)}`
  if (!words.every(w => all.includes(w))) return 0
  const q = words.join(' ')
  let s = 1
  if (name === q) s += 100
  else if (name.startsWith(q)) s += 60
  else if (name.includes(q)) s += 30
  for (const w of words) {
    if (new RegExp(`(^|[\\s_.\\-/(])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) s += 10
    else if (name.includes(w)) s += 4
  }
  // Shorter titles are the likelier target of a short query
  return s + Math.max(0, 10 - name.length / 6)
}

/** Most entities on a dashboard; more only by typing */
export const MAX_HITS = 60

/**
 * Pages, rooms and entities matching the query, best first, pages and rooms before devices of the same score.
 * An empty query lists pages and rooms; with a kind chosen it lists all of that kind, switched-on ones first.
 */
export function search(
  hass: HomeAssistant,
  settings: SearchSettings,
  pages: SearchPage[],
  query: string,
  kind?: SearchKind,
): SearchHit[] {
  const q = query.trim()
  const hits: SearchHit[] = []
  const want = (k: SearchKind) => !kind || kind === k

  if (want('page')) {
    for (const page of pages) {
      const s = score(q, page.label, page.path)
      if (s) hits.push({ kind: 'page', id: page.path, title: page.label, icon: page.icon, score: s + 2 })
    }
  }
  if (want('room')) {
    for (const room of settings.rooms) {
      const s = score(q, room.name, room.floor ?? '')
      if (s) hits.push({ kind: 'room', id: room.id, title: room.name, sub: room.floor, icon: room.icon ?? 'mdi:door', score: s + 1 })
    }
  }
  // Without a query the devices would be the whole house; a chosen kind shows its whole list
  if (q || (kind && kind !== 'page' && kind !== 'room')) {
    const rooms = new Map(settings.rooms.map(r => [r.id, r]))
    for (const entity of allEntities(hass, settings.hide ?? {}, settings.areas)) {
      const k = kindOfEntity(entity.entity_id)
      if (!want(k)) continue
      const areaId = entityAreaId(hass, entity.entity_id)
      const room = areaId ? rooms.get(areaId)?.name ?? hass.areas[areaId]?.name : undefined
      const title = entityName(entity)
      const s = score(q, title, `${room ?? ''} ${entity.entity_id}`)
      if (!s) continue
      hits.push({ kind: k, id: entity.entity_id, title, sub: room, entity, score: s + (!q && isActive(entity) ? 50 : 0) })
    }
  }
  const order = (h: SearchHit) => (h.kind === 'page' ? 0 : h.kind === 'room' ? 1 : 2)
  // Without a query pages and rooms keep the bar's and the dashboard's order
  hits.sort((a, b) => b.score - a.score || order(a) - order(b) || (q || order(a) === 2 ? a.title.localeCompare(b.title) : 0))
  return hits.slice(0, MAX_HITS)
}

/** Kinds with hits for the query, for the chips; the chosen one always stays */
export function kindsFor(hass: HomeAssistant, settings: SearchSettings, pages: SearchPage[], query: string, chosen?: SearchKind): SearchKind[] {
  const found = new Set<SearchKind>()
  const q = query.trim()
  if (pages.some(p => score(q, p.label, p.path))) found.add('page')
  if (settings.rooms.some(r => score(q, r.name, r.floor ?? ''))) found.add('room')
  const rooms = new Map(settings.rooms.map(r => [r.id, r.name]))
  for (const entity of allEntities(hass, settings.hide ?? {}, settings.areas)) {
    const k = kindOfEntity(entity.entity_id)
    if (found.has(k)) continue
    if (!q) { found.add(k); continue }
    const areaId = entityAreaId(hass, entity.entity_id)
    if (score(q, entityName(entity), `${(areaId && rooms.get(areaId)) ?? ''} ${entity.entity_id}`)) found.add(k)
  }
  if (chosen) found.add(chosen)
  return SEARCH_KINDS.filter(k => found.has(k))
}
