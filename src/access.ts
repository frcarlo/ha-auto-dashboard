// Per-user rules. This only decides what the dashboard shows and lets you operate;
// HA has no per-room permissions, so other dashboards or the API are not affected.
import type { Access, HomeAssistant, StrategyConfig, UserRule } from './types'
import { domainOf } from './presentation'

export const CRITICAL_DOMAINS = ['lock', 'alarm_control_panel']

/** Domains whose more-info dialog has controls, so it stays closed when they may not be operated. */
const CONTROL_DOMAINS = [
  'light', 'switch', 'fan', 'input_boolean', 'cover', 'climate', 'humidifier', 'water_heater', 'media_player',
  'lock', 'alarm_control_panel', 'scene', 'script', 'vacuum', 'valve', 'siren', 'button', 'input_button',
  'input_number', 'input_select', 'select', 'number', 'remote', 'lawn_mower',
]

/**
 * The rule for the viewing user: their own entry (user id, full name or first name, case-insensitive),
 * else `default` for non-admins. Admins without their own entry are unrestricted.
 */
export function ruleFor(users: StrategyConfig['users'], user: HomeAssistant['user']): UserRule | undefined {
  if (!users || !user) return undefined
  const name = user.name.trim().toLowerCase()
  const first = name.split(/\s+/)[0]
  const own = Object.entries(users).find(([key]) => {
    const k = key.trim().toLowerCase()
    return key === user.id || (k !== 'default' && (k === name || k === first))
  })
  if (own) return own[1]
  return user.is_admin ? undefined : users.default
}

const ACCESS: Access[] = ['full', 'no_critical', 'read_only']

/** The rule's access; anything unknown counts as full, as without a rule. */
export function accessOf(rule?: UserRule): Access {
  return rule?.access && ACCESS.includes(rule.access) ? rule.access : 'full'
}

/** Both filters apply: the dashboard's own and the user's. */
export function intersect(a?: string[], b?: string[]) {
  if (!a?.length) return b
  if (!b?.length) return a
  return a.filter(x => b.includes(x))
}

export function canControl(access: Access | undefined, entityId: string) {
  if (access === 'read_only') return false
  if (access === 'no_critical' && CRITICAL_DOMAINS.includes(domainOf(entityId))) return false
  return true
}

/** Bulk actions ("all off", all covers of a room) need full access, as `access: no_critical` promises. */
export function canBulk(access: Access | undefined, entityIds: string[]) {
  return (access ?? 'full') === 'full' && entityIds.length > 0
}

/** More-info dialogs of controllable entities would let the user switch them anyway. */
export function canOpen(access: Access | undefined, entityId: string) {
  return !CONTROL_DOMAINS.includes(domainOf(entityId)) || canControl(access, entityId)
}
