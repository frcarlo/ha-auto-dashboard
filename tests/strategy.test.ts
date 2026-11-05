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
    expect(floors).toEqual(['Obergeschoss', 'Erdgeschoss', 'Keller', 'Weitere Räume', 'Listen'])
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

describe('groups by function and now playing', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('the covers page only has shading; garage and window drives go to security', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const tiles = (path: string) => cards(views.find(v => v.path === path)!).filter(c => c.type === 'custom:ad-tile').map(c => c.entity)
    expect(tiles('covers')).not.toContain('cover.garage_tor')
    expect(tiles('covers')).not.toContain('cover.wohnzimmer_dachfenster')
    expect(tiles('covers')).toContain('cover.wohnzimmer_rollo')
    expect(tiles('security')).toEqual(expect.arrayContaining(['cover.garage_tor', 'cover.wohnzimmer_dachfenster', 'binary_sensor.garage_rauch']))
  })

  it('Home has the now playing bar and passes hide options to the header', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_domains: ['person'] }, createHass(true))
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'custom:ad-now-playing')).toBeDefined()
    expect(home.find(c => c.type === 'custom:ad-header')).toMatchObject({ hide_domains: ['person'] })
  })
})

describe('energy, maintenance, cameras and lists', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('adds energy and maintenance pages, linked from Home but not in the nav', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    expect(views.map(v => v.path)).toEqual(expect.arrayContaining(['energy', 'maintenance']))
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'custom:ad-nav-bar')!.items.map((i: any) => i.path)).not.toContain('energy')
    expect(home.find(c => c.type === 'custom:ad-status-bar')!.links).toMatchObject({ battery: 'maintenance', unavailable: 'maintenance' })
    expect(home.find(c => c.type === 'custom:ad-house-info')!.links).toMatchObject({ energy: 'energy', climate: 'climate' })
  })

  it('energy shows each room with a 24-hour history of all its power sensors', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const energy = cards(views.find(v => v.path === 'energy')!)
    const graphs = energy.filter(c => c.type === 'history-graph').flatMap(c => c.entities)
    expect(graphs).toContain('sensor.kuche_backofen')
    expect(graphs).toContain('sensor.wohnzimmer_tv_leistung')
    // More sensors, longer legend, taller graph
    const rows = energy.filter(c => c.type === 'history-graph').map(c => [c.entities.length, c.grid_options.rows])
    expect(rows).toContainEqual([2, 5])
    expect(rows).toContainEqual([1, 5])
    expect(energy.filter(c => c.type === 'custom:ad-power' && c.variant === 'room').map(c => c.areas[0]))
      .toEqual(expect.arrayContaining(['kuche', 'wohnzimmer', 'buro_keller']))
  })

  it('outdoor areas leave the indoor average; updates are for admins only', async () => {
    const admin = await generateDashboard({ type: 'custom:auto-dashboard', outdoor_areas: ['garten'] }, createHass(true))
    const info = cards(admin.views[0]!).find(c => c.type === 'custom:ad-house-info')!
    expect(info.outdoor).toEqual(['garten'])
    expect(info.areas).not.toContain('garten')
    expect(cards(admin.views.find(v => v.path === 'maintenance')!).map(c => c.source)).toContain('updates')
    const hass = createHass(true)
    hass.user = { id: 'x', name: 'Gast', is_admin: false }
    const guest = await generateDashboard({ type: 'custom:auto-dashboard' }, hass)
    expect(cards(guest.views.find(v => v.path === 'maintenance')!).map(c => c.source)).not.toContain('updates')
  })

  it('cameras get their own page in the nav; to-do lists stay on Home; hide_pages removes the new pages', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'picture-entity')).toBeUndefined()
    expect(home.find(c => c.type === 'custom:ad-nav-bar')!.items.map((i: any) => i.path)).toContain('cameras')
    const page = cards(views.find(v => v.path === 'cameras')!)
    expect(page.find(c => c.type === 'picture-entity')).toMatchObject({ entity: 'camera.garage' })
    expect(page.find(c => c.type === 'custom:ad-group-heading')).toMatchObject({ title: 'Garage', path: 'area-garage' })
    expect(home.find(c => c.type === 'todo-list')).toMatchObject({ entity: 'todo.einkauf' })
    expect(cards(views.find(v => v.path === 'area-garage')!).some(c => c.type === 'picture-entity')).toBe(true)
    const hass = createHass(true)
    const ruled = await generateDashboard({ type: 'custom:auto-dashboard', users: { [hass.user!.id]: { hide_pages: ['energy', 'maintenance', 'cameras'] } } }, hass)
    expect(ruled.views.map(v => v.path)).not.toContain('cameras')
    expect(ruled.views.map(v => v.path)).not.toContain('energy')
    expect(ruled.views.map(v => v.path)).not.toContain('maintenance')
  })
})

describe('primary color', () => {
  it('reaches every card, and an invalid value is ignored', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', primary_color: '#0ea5e9' }, createHass(true))
    const all = views.flatMap(v => (v.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)).filter(c => String(c.type).startsWith('custom:'))
    expect(all.every(c => c.primary_color === '#0ea5e9')).toBe(true)
    const bad = await generateDashboard({ type: 'custom:auto-dashboard', primary_color: 'blau' }, createHass(true))
    expect(JSON.stringify(bad.views)).not.toContain('primary_color')
    expect(bad.views[0]!.background).toBeUndefined()
    expect(views.every(v => String(v.background).startsWith('light-dark('))).toBe(true)
    const dark = await generateDashboard({ type: 'custom:auto-dashboard', primary_color: '#0ea5e9', theme: 'dark' }, createHass(true))
    expect(dark.views[0]!.background).toMatch(/^rgb\(/)
  })

  it('gives glass a lit backdrop, with or without an accent', async () => {
    const plain = await generateDashboard({ type: 'custom:auto-dashboard', glass: true, theme: 'dark' }, createHass(true))
    expect(plain.views[0]!.background).toMatch(/^radial-gradient\(.*#0f172a$/)
    const tinted = await generateDashboard({ type: 'custom:auto-dashboard', glass: true, primary_color: '#0ea5e9' }, createHass(true))
    expect(tinted.views.every(v => /^radial-gradient\(.*light-dark\(/.test(String(v.background)))).toBe(true)
  })
})

describe('room settings, own cards and energy settings', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('applies hidden groups, order and own cards on the room page', async () => {
    const config = {
      type: 'custom:auto-dashboard',
      hide_entities: ['light.wohnzimmer_stehlampe'],
      rooms: {
        wohnzimmer: {
          hide_groups: ['sensor' as const],
          group_order: ['media' as const],
          cards: { top: [{ type: 'markdown', content: 'oben' }], light: [{ type: 'markdown', content: 'licht' }], bottom: [{ type: 'markdown', content: 'unten' }] },
        },
      },
    }
    const { views } = await generateDashboard(config, createHass(true))
    const room = views.find(v => v.path === 'area-wohnzimmer')!
    const sections = room.sections as { cards: Record<string, any>[] }[]
    const flat = cards(room)
    expect(sections[1]!.cards[0]).toMatchObject({ content: 'oben' })
    expect(sections.at(-2)!.cards[0]).toMatchObject({ content: 'unten' })
    const headings = flat.filter(c => c.type === 'custom:ad-group-heading').map(c => c.title)
    expect(headings[0]).toBe('Medien')
    expect(headings).not.toContain('Sensoren')
    const lightSection = sections.find(s => s.cards[0]?.title === 'Licht')!
    expect(lightSection.cards.at(-1)).toMatchObject({ content: 'licht' })
    expect(flat.map(c => c.entity)).not.toContain('light.wohnzimmer_stehlampe')
    // Hidden everywhere, not only in the room
    expect(cards(views.find(v => v.path === 'lights')!).map(c => c.entity)).not.toContain('light.wohnzimmer_stehlampe')
    expect(cards(views[0]!).find(c => c.type === 'custom:ad-room-card')).toMatchObject({ hide_entities: ['light.wohnzimmer_stehlampe'] })
  })

  it('passes the energy settings to the house cards', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const sources = { grid: ['sensor.netz_leistung'], solar: ['sensor.pv_leistung'] }
    expect(cards(views[0]!).find(c => c.type === 'custom:ad-house-info')!.power_sources).toEqual(sources)
    expect(cards(views.find(v => v.path === 'energy')!).find(c => c.variant === 'house')!.power_sources).toEqual(sources)
  })

  it('without access to the energy settings the rooms still count', async () => {
    const hass = createHass(true)
    hass.callWS = async () => { throw new Error('unauthorized') }
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, hass)
    expect(views.map(v => v.path)).toContain('energy')
    expect(cards(views[0]!).find(c => c.type === 'custom:ad-house-info')!.power_sources).toBeUndefined()
  })

  it('ha_colors: false reaches the nav bar', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', primary_color: '#14b8a6', ha_colors: false }, createHass(true))
    expect(cards(views[0]!).find(c => c.type === 'custom:ad-nav-bar')).toMatchObject({ ha_colors: false })
  })
})

describe('hand-written YAML', () => {
  it('hide_areas as a single name hides exactly that room', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_areas: 'bad' as unknown as string[] }, createHass(true))
    const paths = views.map(v => v.path)
    expect(paths).not.toContain('area-bad')
    expect(paths).toContain('area-garage')
  })
})

describe('to-do lists', () => {
  const lists = async (config: Record<string, unknown>) => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', ...config }, createHass(true))
    return (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).filter(c => c.type === 'todo-list')
  }

  it('shows every list with its name as title', async () => {
    expect((await lists({})).map(c => [c.entity, c.title])).toEqual([['todo.einkauf', 'Einkaufsliste'], ['todo.werkstatt', 'Werkstatt']])
  })

  it('todo_lists picks lists, hide_domains todo hides them all', async () => {
    expect((await lists({ todo_lists: ['todo.werkstatt'] })).map(c => c.entity)).toEqual(['todo.werkstatt'])
    expect(await lists({ hide_domains: ['todo'], todo_lists: ['todo.werkstatt'] })).toEqual([])
  })
})
