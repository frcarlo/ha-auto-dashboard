// Keeps the saved strategy config as small as hand-written YAML: no defaults, no empty lists.
import type { PopupRule, RoomSettings, StrategyConfig, UserRule } from './types'

const DEFAULTS: Partial<Record<string, unknown>> = { theme: 'auto', glass: false, nav_position: 'bottom', ha_colors: true, forecast_days: 3 }
const RULE_DEFAULTS: Partial<Record<string, unknown>> = { access: 'full', settings: true }

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

/** Pages without own cards drop out, so the YAML stays short */
function cleanPages(pages: StrategyConfig['pages']): StrategyConfig['pages'] {
  const kept = Object.entries(pages ?? {}).flatMap(([path, page]) => {
    const cards = Object.fromEntries(Object.entries(page?.cards ?? {}).filter(([, list]) => list?.length))
    return Object.keys(cards).length ? [[path, { ...page, cards }]] : []
  })
  return kept.length ? Object.fromEntries(kept) : undefined
}

export function cleanConfig(config: StrategyConfig): StrategyConfig {
  const { users, rooms, pages, type: _type, ...rest } = config
  const out = clean(rest, DEFAULTS) as Omit<StrategyConfig, 'type'>
  const keptRooms = Object.entries(rooms ?? {}).map(([id, room]) => [id, cleanRoom(room)] as const).filter(([, room]) => room)
  if (keptRooms.length) out.rooms = Object.fromEntries(keptRooms) as Record<string, RoomSettings>
  // Users keep their entry even without restrictions, so the editor doesn't drop a rule while it's being filled in
  if (users && Object.keys(users).length) out.users = Object.fromEntries(Object.entries(users).map(([k, r]) => [k, cleanRule(r)]))
  const keptPages = cleanPages(pages)
  if (keptPages) out.pages = keptPages
  return { type: config.type, ...out }
}

const LIST_KEYS = [
  'areas', 'floors', 'hide_pages', 'hide_areas', 'area_order', 'hide_domains', 'hide_labels', 'hide_entities',
  'favorites', 'scenes', 'todo_lists', 'outdoor_areas', 'weather_warnings', 'calendars', 'tv_apps', 'hide_chips',
] as const
const RULE_LIST_KEYS = ['areas', 'floors', 'hide_pages', 'hide_chips'] as const
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

/**
 * Old names keep working: each maps to its new key and, where the meaning changed shape, its new value.
 * The new key wins when both are set; earlier aliases win over later ones. Renaming a key adds it here,
 * so existing configs never break.
 */
interface Alias { to: string; value?: (v: unknown) => unknown }
const ALIASES: Record<string, Alias> = {}
const RULE_ALIASES: Record<string, Alias> = {
  // Before 1.0 two switches stood for the three access levels
  read_only: { to: 'access', value: v => v === true ? 'read_only' : undefined },
  control_critical: { to: 'access', value: v => v === false ? 'no_critical' : undefined },
}

function unalias<T extends object>(obj: T, aliases: Record<string, Alias>): T {
  const out = { ...obj } as Record<string, unknown>
  for (const [old, { to, value }] of Object.entries(aliases)) {
    if (!(old in out)) continue
    const v = value ? value(out[old]) : out[old]
    delete out[old]
    if (out[to] === undefined && v !== undefined) out[to] = v
  }
  return out as T
}

/**
 * Popups as YAML allows them: one rule instead of a list, a bare trigger id for a rule, one action instead of a list.
 */
function normalizePopups(popups: unknown): PopupRule[] {
  const list = Array.isArray(popups) ? popups : [popups]
  return list
    .map(rule => typeof rule === 'string' ? { trigger: rule.trim() } : rule as PopupRule | null)
    .filter((rule): rule is PopupRule => !!rule && typeof rule === 'object')
    .map(rule => listify(rule, ['actions']))
}

/** Hand-written YAML tolerated: old key names, and single values for lists, in the dashboard, user rules and room settings. */
export function normalizeConfig(config: StrategyConfig): StrategyConfig {
  const out = listify(unalias(config, ALIASES), LIST_KEYS)
  if (out.users) out.users = Object.fromEntries(Object.entries(out.users).map(([k, rule]) => [k, listify(unalias(rule ?? {}, RULE_ALIASES), RULE_LIST_KEYS)]))
  if (out.rooms) out.rooms = Object.fromEntries(Object.entries(out.rooms).map(([k, room]) => [k, listify(room ?? {}, ROOM_LIST_KEYS)]))
  if (out.popups) out.popups = normalizePopups(out.popups)
  return out
}
