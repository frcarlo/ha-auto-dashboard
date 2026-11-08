import { describe, expect, it } from 'vitest'
import { accessOf, canControl, canOpen, intersect, ruleFor } from '../src/access'

const users = {
  leni: { areas: ['zimmer_leni'], access: 'no_critical' as const },
  'Gast Zugang': { access: 'read_only' as const },
  abc123: { hide_pages: ['security' as const] },
  default: { access: 'no_critical' as const },
}

describe('ruleFor', () => {
  it('matches first name, full name and user id, case-insensitive', () => {
    expect(ruleFor(users, { id: 'x', name: 'Leni Carlo' })).toBe(users.leni)
    expect(ruleFor(users, { id: 'y', name: 'gast zugang' })).toBe(users['Gast Zugang'])
    expect(ruleFor(users, { id: 'abc123', name: 'Jonathan' })).toBe(users.abc123)
  })

  it('uses default for other non-admins and leaves other admins alone', () => {
    expect(ruleFor(users, { id: 'z', name: 'Joshua', is_admin: false })).toBe(users.default)
    expect(ruleFor(users, { id: 'z', name: 'Francesco Carlo', is_admin: true })).toBeUndefined()
    expect(ruleFor(undefined, { id: 'z', name: 'Joshua' })).toBeUndefined()
  })

  it('never treats a user named "default" as their own entry', () => {
    expect(ruleFor({ default: { access: 'read_only' } }, { id: 'd', name: 'Default', is_admin: true })).toBeUndefined()
  })
})

describe('access', () => {
  it('derives the access level', () => {
    expect(accessOf(undefined)).toBe('full')
    expect(accessOf({ access: 'no_critical' })).toBe('no_critical')
    expect(accessOf({ access: 'read_only' })).toBe('read_only')
    expect(accessOf({ access: 'nonsense' as never })).toBe('full')
  })

  it('gates controls and more-info', () => {
    expect(canControl('no_critical', 'lock.haustur')).toBe(false)
    expect(canControl('no_critical', 'light.flur')).toBe(true)
    expect(canControl('read_only', 'light.flur')).toBe(false)
    expect(canOpen('read_only', 'sensor.temp')).toBe(true)
    expect(canOpen('read_only', 'climate.bad')).toBe(false)
    expect(canOpen('no_critical', 'alarm_control_panel.haus')).toBe(false)
  })

  it('intersects filters', () => {
    expect(intersect(undefined, ['a'])).toEqual(['a'])
    expect(intersect(['a', 'b'], ['b', 'c'])).toEqual(['b'])
    expect(intersect(['a'], undefined)).toEqual(['a'])
  })
})
