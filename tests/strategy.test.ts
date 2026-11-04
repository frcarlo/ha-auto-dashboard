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

  it('hide_labels drops labelled entities from room pages and reaches the cards', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_labels: ['technik'] }, createHass(true))
    const entities = (path: string) => JSON.stringify(views.find(v => v.path === path)!.sections)
    expect(entities('area-kuche')).not.toContain('switch.kuche_kaffee')
    expect(entities('area-kuche')).toContain('light.kuche')
    const cards = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
    expect(cards.find(c => c.type === 'custom:ad-status-bar')).toMatchObject({ hide_labels: ['technik'] })
    expect(cards.filter(c => c.type === 'custom:ad-room-card').every(c => c.hide_labels?.[0] === 'technik')).toBe(true)
  })
})

describe('filters and nav position', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('floors limits rooms, pages and the status bar to those floors', async () => {
    const { title, views } = await generateDashboard({ type: 'custom:auto-dashboard', floors: ['og'] }, createHass(true))
    expect(views.filter(v => String(v.path).startsWith('area-')).map(v => v.path)).toEqual(['area-bad', 'area-schlafzimmer'])
    expect(title).toBe('Obergeschoss')
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'custom:ad-status-bar')!.areas).toEqual(['bad', 'schlafzimmer'])
    expect(home.find(c => c.type === 'custom:ad-header')!.scope).toBe('Obergeschoss')
    const lights = views.find(v => v.path === 'lights')!
    expect(cards(lights).filter(c => c.type === 'custom:ad-tile').map(c => c.entity)).toEqual(['light.bad', 'light.schlafzimmer'])
  })

  it('a single area puts its content on the home page', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', areas: ['wohnzimmer'] }, createHass(true))
    const home = cards(views[0]!)
    expect(home.some(c => c.type === 'custom:ad-room-card')).toBe(false)
    expect(home.filter(c => c.type === 'custom:ad-tile').length).toBeGreaterThan(5)
  })

  it('fails with a readable error when the filter matches nothing', async () => {
    await expect(generateDashboard({ type: 'custom:auto-dashboard', areas: ['gibtsnicht'] }, createHass(true)))
      .rejects.toThrow(/keine Räume/)
  })

  it('puts the nav first for the top position', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', nav_position: 'top' }, createHass(true))
    for (const view of views) {
      const first = (view.sections as { cards: Record<string, any>[] }[])[0]!.cards[0]!
      expect(first).toMatchObject({ type: 'custom:ad-nav-bar', position: 'top' })
    }
  })
})

describe('per-user rules', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
  const asUser = (name: string, is_admin = false) => {
    const hass = createHass(true)
    hass.user = { id: `id-${name}`, name, is_admin }
    return hass
  }
  const users = {
    leni: { areas: ['schlafzimmer', 'wohnzimmer'], hide_pages: ['security' as const], control_critical: false },
    gast: { read_only: true },
  }

  it('narrows rooms and pages and passes the access level to every card', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', users }, asUser('Leni'))
    expect(views.map(v => v.path)).not.toContain('security')
    expect(views.filter(v => String(v.path).startsWith('area-')).map(v => v.path)).toEqual(['area-schlafzimmer', 'area-wohnzimmer'])
    const custom = views.flatMap(cards).filter(c => String(c.type).startsWith('custom:'))
    expect(custom.every(c => c.access === 'no_critical')).toBe(true)
  })

  it('read-only users get read_only cards; admins without an entry see everything', async () => {
    const guest = await generateDashboard({ type: 'custom:auto-dashboard', users }, asUser('Gast'))
    expect(cards(guest.views[0]!).find(c => c.type === 'custom:ad-header')!.access).toBe('read_only')
    const admin = await generateDashboard({ type: 'custom:auto-dashboard', users }, asUser('Francesco', true))
    expect(admin.views.flatMap(cards).some(c => 'access' in c)).toBe(false)
    expect(admin.views.map(v => v.path)).toContain('security')
  })
})

describe('room page, favorites and scenes', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('room pages open with the room header and group headings with bulk controls', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const room = cards(views.find(v => v.path === 'area-wohnzimmer')!)
    expect(room[0]).toMatchObject({ type: 'custom:ad-room-header', area: 'wohnzimmer' })
    const lights = room.find(c => c.type === 'custom:ad-group-heading' && c.title === 'Licht')
    expect(lights).toMatchObject({ control: 'toggle' })
    expect(lights!.entities).toHaveLength(2)
  })

  it('domain pages get one heading per room linking to the room', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const lights = cards(views.find(v => v.path === 'lights')!).filter(c => c.type === 'custom:ad-group-heading')
    expect(lights.find(c => c.title === 'Wohnzimmer')).toMatchObject({ path: 'area-wohnzimmer', sub: true, control: 'toggle' })
    expect(lights.find(c => c.title === 'Flur')!.control).toBeUndefined()
  })

  it('favorites appear on Home and in their room; scenes default to all scenes', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', favorites: ['light.flur', 'script.gute_nacht'] }, createHass(true))
    const home = cards(views[0]!)
    const tiles = home.filter(c => c.type === 'custom:ad-tile').map(c => c.entity)
    expect(tiles).toEqual(['light.flur', 'script.gute_nacht'])
    expect(home.find(c => c.type === 'custom:ad-scenes')!.entities).toEqual(['scene.esszimmer_abendessen', 'scene.wohnzimmer_kino'])
    const flur = cards(views.find(v => v.path === 'area-flur')!)
    expect(flur.filter(c => c.entity === 'light.flur')).toHaveLength(2)
  })

  it('picked scenes replace the automatic list', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', scenes: ['script.gute_nacht'] }, createHass(true))
    expect(cards(views[0]!).find(c => c.type === 'custom:ad-scenes')!.entities).toEqual(['script.gute_nacht'])
  })
})
