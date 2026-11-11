import { describe, expect, it } from 'vitest'
import { faceFor, personalDiff, withPersonal } from '../src/personal'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'
import type { StrategyConfig } from '../src/types'

const base: StrategyConfig = { type: 'custom:auto-dashboard', theme: 'dark', favorites: ['light.flur'], face: { style: 'clock', after: 120 } }

/** The mock hass with a user's own settings stored for this dashboard */
function hassWith(value: unknown, calls: Record<string, unknown>[] = []) {
  const hass = createHass(true)
  const inner = hass.callWS!
  hass.callWS = (async (msg: Record<string, unknown>) => {
    calls.push(msg)
    if (msg.type === 'frontend/get_user_data') return { value }
    return inner(msg)
  }) as typeof hass.callWS
  return hass
}

describe('own settings', () => {
  it('lay the look and favorites over the dashboard, nothing else', () => {
    const out = withPersonal(base, { theme: 'light', glass: true, favorites: ['light.decke'], hide_pages: ['lights'] })
    expect(out).toMatchObject({ theme: 'light', glass: true, favorites: ['light.decke'] })
    expect(out.hide_pages).toBeUndefined()
    expect(withPersonal(base, undefined)).toBe(base)
  })

  it('let the user show the floors as tabs or not, whatever the dashboard says', () => {
    expect(withPersonal({ ...base, floor_tabs: true }, { floor_tabs: false }).floor_tabs).toBe(false)
    expect(withPersonal(base, { floor_tabs: true }).floor_tabs).toBe(true)
    // '' picks the floor last chosen on the device, over the dashboard's start floor
    expect(withPersonal({ ...base, floor_start: 'eg' }, { floor_start: '' }).floor_start).toBe('')
    expect(withPersonal({ ...base, floor_start: 'eg' }, { floor_start: 'og' }).floor_start).toBe('og')
  })

  it('the admin switching the face off wins; otherwise the user may switch it off or change it', () => {
    expect(faceFor(base, { face: false }, { face: { style: 'analog' } })).toBeUndefined()
    expect(faceFor(base, undefined, { face: false })).toBeUndefined()
    expect(faceFor(base, undefined, { face: { style: 'analog' } })).toEqual({ style: 'analog', after: 120 })
    expect(faceFor({ type: 'x' }, undefined, undefined)).toBeUndefined()
  })

  it('keeps only what differs from the dashboard', () => {
    const dashboard = { theme: 'auto' as const, glass: false, nav_position: 'bottom' as const, favorites: ['light.flur'], face: false as const }
    expect(personalDiff({ ...dashboard, hide_pages: [] }, dashboard)).toBeNull()
    expect(personalDiff({ ...dashboard, theme: 'dark', hide_pages: ['music'] }, dashboard)).toEqual({ theme: 'dark', hide_pages: ['music'] })
  })

  it('reach the generated dashboard: look on the cards, pages out of the bar, own favorites on Home', async () => {
    const calls: Record<string, unknown>[] = []
    const { views } = await generateDashboard(base, hassWith({ theme: 'light', hide_pages: ['lights'], favorites: ['light.wohnzimmer_decke'] }, calls))
    expect(calls.find(c => c.type === 'frontend/get_user_data')).toMatchObject({ key: 'auto_dashboard:lovelace' })
    const home = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
    expect(home.find(c => c.type === 'custom:ad-header')).toMatchObject({ theme: 'light', settings: 'settings' })
    const nav = home.find(c => c.type === 'custom:ad-nav-bar')!
    expect(nav.items.map((i: { path: string }) => i.path)).not.toContain('lights')
    expect(views.map(v => v.path)).not.toContain('lights')
    expect(home.filter(c => c.type === 'custom:ad-tile').map(c => c.entity)).toContain('light.wohnzimmer_decke')
    // The settings page still offers the hidden page, and starts from what the dashboard sets
    const settings = (views.find(v => v.path === 'settings')!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).find(c => c.type === 'custom:ad-settings')!
    expect(settings.pages.map((p: { path: string }) => p.path)).toContain('lights')
    expect(settings.base).toMatchObject({ theme: 'dark', favorites: ['light.flur'] })
  })

  it('a user the admin keeps to the rule gets neither the settings page nor their stored settings', async () => {
    const calls: Record<string, unknown>[] = []
    const config = { ...base, users: { frank: { settings: false } } }
    const { views } = await generateDashboard(config, hassWith({ theme: 'light' }, calls))
    expect(calls.some(c => c.type === 'frontend/get_user_data')).toBe(false)
    expect(views.map(v => v.path)).not.toContain('settings')
    const home = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
    expect(home.find(c => c.type === 'custom:ad-header')).not.toHaveProperty('settings')
  })
})

describe('own cards for one user', () => {
  const md = (content: string) => ({ type: 'markdown', content })

  it("come after the dashboard's own cards, page by page", () => {
    const config: StrategyConfig = { type: 'custom:auto-dashboard', pages: { home: { cards: { top: [md('admin')] } } } }
    const merged = withPersonal(config, { pages: { home: { cards: { top: [md('mine')], bottom: [md('end')] } }, lights: { cards: { top: [md('licht')] } } } })
    expect(merged.pages).toEqual({
      home: { cards: { top: [md('admin'), md('mine')], bottom: [md('end')] } },
      lights: { cards: { top: [md('licht')], bottom: [] } },
    })
  })

  it('are stored without empty pages', () => {
    expect(personalDiff({ pages: { home: { cards: { top: [] } }, music: { cards: { bottom: [md('x')] } } } }, {}))
      .toEqual({ pages: { music: { cards: { bottom: [md('x')] } } } })
    expect(personalDiff({ pages: { home: { cards: { top: [] } } } }, {})).toBeNull()
  })

  it('show on the page for that user', async () => {
    const hass = createHass(true)
    const key = 'auto_dashboard:lovelace'
    const ws = hass.callWS!
    hass.callWS = async <T,>(msg: Record<string, unknown>) =>
      msg.type === 'frontend/get_user_data' && msg.key === key ? { value: { pages: { maintenance: { cards: { top: [md('mine')] } } } } } as T : ws<T>(msg)
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, hass)
    const maintenance = views.find(v => v.path === 'maintenance') as any
    expect(maintenance.sections[1].cards).toEqual([{ ...md('mine'), grid_options: { columns: 'full' } }])
  })
})
