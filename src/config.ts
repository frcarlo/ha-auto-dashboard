// Keeps the saved strategy config as small as hand-written YAML: no defaults, no empty lists.
import type { StrategyConfig, UserRule } from './types'

const DEFAULTS: Partial<Record<string, unknown>> = { theme: 'auto', glass: false, nav_position: 'bottom' }
const RULE_DEFAULTS: Partial<Record<string, unknown>> = { read_only: false, control_critical: true }

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)

function clean<T extends object>(obj: T, defaults: Partial<Record<string, unknown>>): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => !isEmpty(v) && defaults[k] !== v)) as Partial<T>
}

export function cleanRule(rule: UserRule): UserRule {
  return clean(rule, RULE_DEFAULTS)
}

export function cleanConfig(config: StrategyConfig): StrategyConfig {
  const { users, type: _type, ...rest } = config
  const out = clean(rest, DEFAULTS) as Omit<StrategyConfig, 'type'>
  // Users keep their entry even without restrictions, so the editor doesn't drop a rule while it's being filled in
  if (users && Object.keys(users).length) out.users = Object.fromEntries(Object.entries(users).map(([k, r]) => [k, cleanRule(r)]))
  return { type: config.type, ...out }
}
