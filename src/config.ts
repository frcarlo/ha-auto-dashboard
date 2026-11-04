// Keeps the saved strategy config as small as hand-written YAML: no defaults, no empty lists.
import type { RoomSettings, StrategyConfig, UserRule } from './types'

const DEFAULTS: Partial<Record<string, unknown>> = { theme: 'auto', glass: false, nav_position: 'bottom', ha_colors: true }
const RULE_DEFAULTS: Partial<Record<string, unknown>> = { read_only: false, control_critical: true }

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)

function clean<T extends object>(obj: T, defaults: Partial<Record<string, unknown>>): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => !isEmpty(v) && defaults[k] !== v)) as Partial<T>
}

export function cleanRule(rule: UserRule): UserRule {
  return clean(rule, RULE_DEFAULTS)
}

/** A room's settings without empty lists and empty card slots; undefined when nothing is left. */
export function cleanRoom(room: RoomSettings): RoomSettings | undefined {
  const cards = Object.fromEntries(Object.entries(room.cards ?? {}).filter(([, list]) => list?.length))
  const out: RoomSettings = clean({ ...room, cards: undefined }, {})
  if (Object.keys(cards).length) out.cards = cards
  return Object.keys(out).length ? out : undefined
}

export function cleanConfig(config: StrategyConfig): StrategyConfig {
  const { users, rooms, type: _type, ...rest } = config
  const out = clean(rest, DEFAULTS) as Omit<StrategyConfig, 'type'>
  const keptRooms = Object.entries(rooms ?? {}).map(([id, room]) => [id, cleanRoom(room)] as const).filter(([, room]) => room)
  if (keptRooms.length) out.rooms = Object.fromEntries(keptRooms) as Record<string, RoomSettings>
  // Users keep their entry even without restrictions, so the editor doesn't drop a rule while it's being filled in
  if (users && Object.keys(users).length) out.users = Object.fromEntries(Object.entries(users).map(([k, r]) => [k, cleanRule(r)]))
  return { type: config.type, ...out }
}

const LIST_KEYS = ['areas', 'floors', 'hide_areas', 'area_order', 'hide_domains', 'hide_labels', 'hide_entities', 'favorites', 'scenes', 'todo_lists', 'outdoor_areas'] as const
const RULE_LIST_KEYS = ['areas', 'floors', 'hide_pages'] as const
const ROOM_LIST_KEYS = ['hide_groups', 'group_order', 'order'] as const

/** One value where YAML wants a list (`hide_areas: keller`) becomes a one-item list. */
function listify<T extends object>(obj: T, keys: readonly string[]): T {
  const out = { ...obj } as Record<string, unknown>
  for (const key of keys) {
    const value = out[key]
    if (typeof value === 'string') out[key] = value.trim() ? [value.trim()] : []
  }
  return out as T
}

/** Hand-written YAML tolerated: single values for lists, in the dashboard, user rules and room settings. */
export function normalizeConfig(config: StrategyConfig): StrategyConfig {
  const out = listify(config, LIST_KEYS)
  if (out.users) out.users = Object.fromEntries(Object.entries(out.users).map(([k, rule]) => [k, listify(rule ?? {}, RULE_LIST_KEYS)]))
  if (out.rooms) out.rooms = Object.fromEntries(Object.entries(out.rooms).map(([k, room]) => [k, listify(room ?? {}, ROOM_LIST_KEYS)]))
  return out
}
