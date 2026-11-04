import { describe, expect, it } from 'vitest'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'

describe('generateDashboard', () => {
  it('builds home, domain and room views from the registries', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const paths = views.map(v => v.path)
    expect(paths.slice(0, 5)).toEqual(['home', 'lights', 'climate', 'covers', 'security'])
    expect(paths).toContain('area-wohnzimmer')
    // Only Home is a top-level view, so HA shows no tab bar
    expect(views.filter(v => !v.subview).map(v => v.path)).toEqual(['home'])
  })

  it('puts one room card per area under its floor, top floor first', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const sections = views[0]!.sections as { cards: Record<string, any>[] }[]
    const floors = sections.slice(1, -1).map(s => s.cards[0]!.heading)
    expect(floors).toEqual(['Obergeschoss', 'Erdgeschoss', 'Keller', 'Weitere Räume'])
    const rooms = sections.flatMap(s => s.cards).filter(c => c.type === 'custom:ad-room-card').map(c => c.area)
    expect(new Set(rooms).size).toBe(rooms.length)
  })

  it('applies hide_areas, hide_domains and the look options', async () => {
    const { views } = await generateDashboard(
      { type: 'custom:auto-dashboard', hide_areas: ['garage'], hide_domains: ['cover'], theme: 'light', glass: true },
      createHass(true),
    )
    const paths = views.map(v => v.path)
    expect(paths).not.toContain('area-garage')
    expect(paths).not.toContain('covers')
    const header = (views[0]!.sections as { cards: Record<string, any>[] }[])[0]!.cards[0]!
    expect(header).toMatchObject({ theme: 'light', glass: true })
  })
})
