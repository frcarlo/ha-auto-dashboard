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
