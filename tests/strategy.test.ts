import { describe, expect, it } from 'vitest'
import { generateDashboard } from '../src/strategy'
import { findCameras, detectionsFrom, detectionKind } from '../src/cameras'
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
    const rooms = sections.flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c]).filter(c => c.type === 'custom:ad-room-card').map(c => c.area)
    expect(new Set(rooms).size).toBe(rooms.length)
  })

  it('shows the climate page as one card per room with its thermostat and readings', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const cards = (views.find(v => v.path === 'climate')!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])
    const rooms = cards.filter(c => c.type === 'custom:ad-climate-room')
    expect(new Set(rooms.map(c => c.area)).size).toBe(rooms.length)
    expect(rooms.find(c => c.area === 'wohnzimmer')!.entities).toContain('climate.wohnzimmer')
    expect(cards.some(c => c.type === 'custom:ad-tile' && String(c.entity).startsWith('climate.wohnzimmer'))).toBe(false)
  })

  it('gives blinds and awnings of one room their own headings on the covers page', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const cards = (views.find(v => v.path === 'covers')!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])
    const kinds = cards.filter(c => c.type === 'custom:ad-group-heading' && c.minor)
    expect(kinds.map(c => [c.title, c.entities])).toEqual([['Beschattung', ['cover.esszimmer']], ['Markisen', ['cover.esszimmer_markise']]])
    expect(cards.find(c => c.type === 'custom:ad-group-heading' && c.title === 'Esszimmer')!.control).toBeUndefined()
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
    const cards = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])
    expect(cards.find(c => c.type === 'custom:ad-status-bar')).toMatchObject({ hide_labels: ['technik'] })
    expect(cards.filter(c => c.type === 'custom:ad-room-card').every(c => c.hide_labels?.[0] === 'technik')).toBe(true)
  })
})

describe('filters and nav position', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

  it('floors limits rooms, pages and the status bar to those floors', async () => {
    const { title, views } = await generateDashboard({ type: 'custom:auto-dashboard', floors: ['og'] }, createHass(true))
    expect(views.filter(v => String(v.path).startsWith('area-')).map(v => v.path)).toEqual(['area-bad', 'area-schlafzimmer'])
    expect(title).toBe('Zuhause')
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'custom:ad-status-bar')!.areas).toEqual(['bad', 'schlafzimmer'])
    // The header greets without listing rooms
    expect(home.find(c => c.type === 'custom:ad-header')!.scope).toBeUndefined()
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
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])
  const asUser = (name: string, is_admin = false) => {
    const hass = createHass(true)
    hass.user = { id: `id-${name}`, name, is_admin }
    return hass
  }
  const users = {
    leni: { areas: ['schlafzimmer', 'wohnzimmer'], hide_pages: ['security' as const], access: 'no_critical' as const },
    gast: { access: 'read_only' as const },
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

  it('still understands rules written before 1.0', async () => {
    const old = { gast: { read_only: true } } as never
    const guest = await generateDashboard({ type: 'custom:auto-dashboard', users: old }, asUser('Gast'))
    expect(cards(guest.views[0]!).find(c => c.type === 'custom:ad-header')!.access).toBe('read_only')
  })

  it('hide_pages on the dashboard hides pages for admins too, on top of the rules', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_pages: ['cameras'], users }, asUser('Leni'))
    expect(views.map(v => v.path)).not.toContain('cameras')
    expect(views.map(v => v.path)).not.toContain('security')
    const admin = await generateDashboard({ type: 'custom:auto-dashboard', hide_pages: ['cameras', 'energy'] }, asUser('Francesco', true))
    expect(admin.views.map(v => v.path)).not.toContain('cameras')
    expect(admin.views.map(v => v.path)).not.toContain('energy')
    expect(admin.views.map(v => v.path)).toContain('security')
  })
})

describe('room page, favorites and scenes', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

  it('room pages open with the room header and group headings with bulk controls', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const room = cards(views.find(v => v.path === 'area-wohnzimmer')!)
    expect(room[0]).toMatchObject({ type: 'custom:ad-room-header', area: 'wohnzimmer' })
    expect(room[1]).toMatchObject({ type: 'custom:ad-status-bar', areas: ['wohnzimmer'], people: false })
    const lights = room.find(c => c.type === 'custom:ad-group-heading' && c.title === 'Licht')
    expect(lights).toMatchObject({ control: 'toggle' })
    expect(lights!.entities).toHaveLength(2)
  })

  it('lights, covers and security list what happened today beside the tiles; climate does not', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    for (const path of ['lights', 'covers', 'security']) {
      const view = views.find(v => v.path === path)! as any
      const feed = view.sections.find((s: any) => s.cards.some((c: any) => c.type === 'custom:ad-activity'))
      expect(feed, path).toMatchObject({ column_span: 1 })
      expect(view.max_columns).toBe(3)
    }
    const lights = (views.find(v => v.path === 'lights') as any).sections.flatMap((s: any) => s.cards).find((c: any) => c.type === 'custom:ad-activity')
    expect(lights.entities.every((id: string) => id.startsWith('light.'))).toBe(true)
    expect(cards(views.find(v => v.path === 'climate')!).some(c => c.type === 'custom:ad-activity')).toBe(false)
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
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

  it('the covers page only has shading; garage and window drives go to security', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const tiles = (path: string) => cards(views.find(v => v.path === path)!).filter(c => c.type === 'custom:ad-tile').map(c => c.entity)
    expect(tiles('covers')).not.toContain('cover.garage_tor')
    expect(tiles('covers')).not.toContain('cover.wohnzimmer_dachfenster')
    expect(tiles('covers')).toContain('cover.wohnzimmer_rollo')
    expect(tiles('security')).toEqual(expect.arrayContaining(['cover.garage_tor', 'cover.wohnzimmer_dachfenster', 'binary_sensor.garage_rauch']))
  })

  it('Home has the now playing bar and passes hide options to the status bar, which shows the people', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_domains: ['person'] }, createHass(true))
    const home = cards(views[0]!)
    expect(home.find(c => c.type === 'custom:ad-now-playing')).toBeDefined()
    expect(home.find(c => c.type === 'custom:ad-status-bar')).toMatchObject({ hide_domains: ['person'] })
  })

  it('puts weather beside inside and power, and now playing beside the scenes', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const rows = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).filter(c => c.type === 'custom:ad-row')
    expect(rows.map(r => [r.cards.map((c: Record<string, unknown>) => c.type), r.widths, r.align])).toEqual([
      [['custom:ad-weather', 'custom:ad-house-info'], [2, 1], undefined],
      [['custom:ad-now-playing', 'custom:ad-scenes'], undefined, 'center'],
    ])
    // Without scenes now playing stands alone
    const none = await generateDashboard({ type: 'custom:auto-dashboard', hide_domains: ['scene'] }, createHass(true))
    const top = (none.views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
    expect(top.some(c => c.type === 'custom:ad-now-playing')).toBe(true)
  })
})

describe('energy, maintenance, cameras and lists', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

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
    const admin = await generateDashboard({ type: 'custom:auto-dashboard', outdoor_areas: ['garten'], hide_domains: ['weather'] }, createHass(true))
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
    const camerasCard = page.find(c => c.type === 'custom:ad-cameras')!
    expect(camerasCard.cameras.map((c: { name: string }) => c.name)).toEqual(['Haustür', 'Terrasse', 'Einfahrt', 'Esszimmer', 'Flur'])
    expect(page.find(c => c.type === 'picture-entity')).toBeUndefined()
    // On the room page the doorbell is one camera, with its device's name
    const door = cards(views.find(v => v.path === 'area-eingangstur')!).filter(c => c.type === 'picture-entity')
    expect(door).toHaveLength(1)
    expect(door[0]).toMatchObject({ entity: 'camera.haustur_standardauflosung' })
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
    const all = views.flatMap(v => (v.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])).filter(c => String(c.type).startsWith('custom:'))
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

  it('hands a background image to HA in its own format, also instead of the glass light', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', glass: true, theme: 'dark', background_image: ' media-source://image_upload/abc ' }, createHass(true))
    expect(views.every(v => JSON.stringify(v.background) === JSON.stringify({
      image: 'media-source://image_upload/abc', opacity: 55, size: 'cover', alignment: 'center', repeat: 'no-repeat', attachment: 'fixed',
    }))).toBe(true)
    const auto = await generateDashboard({ type: 'custom:auto-dashboard', background_image: '/local/garten.jpg' }, createHass(true))
    expect(auto.views[0]!.background).toMatchObject({ image: '/local/garten.jpg', opacity: 60 })
    const blank = await generateDashboard({ type: 'custom:auto-dashboard', background_image: '  ' }, createHass(true))
    expect(blank.views[0]!.background).toBeUndefined()
  })
})

describe('room settings, own cards and energy settings', () => {
  const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

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
  const generate = (config: Record<string, unknown>, hass = createHass(true)) => generateDashboard({ type: 'custom:auto-dashboard', ...config }, hass)
  const listsCard = async (config: Record<string, unknown>, hass?: ReturnType<typeof createHass>) => {
    const page = (await generate(config, hass)).views.find(v => v.path === 'lists')
    return page && (page.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).find(c => c.type === 'custom:ad-lists')
  }

  it('get their own page in the nav and leave the home page', async () => {
    const { views } = await generate({})
    const home = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)
    expect(JSON.stringify(home)).not.toContain('todo')
    expect(home.find(c => c.type === 'custom:ad-nav-bar')!.items.map((i: any) => i.path)).toContain('lists')
    expect(views.find(v => v.path === 'lists')!.subview).toBe(true)
    // Without a pick the card finds the lists itself, so new ones show at once
    expect(await listsCard({ hide_labels: ['technik'] })).toMatchObject({ hide_labels: ['technik'] })
    expect((await listsCard({}))!.entities).toBeUndefined()
  })

  it('todo_lists picks lists, hide_domains todo or hide_pages drops the page', async () => {
    expect((await listsCard({ todo_lists: ['todo.werkstatt'] }))!.entities).toEqual(['todo.werkstatt'])
    expect(await listsCard({ hide_domains: ['todo'], todo_lists: ['todo.werkstatt'] })).toBeUndefined()
    const hass = createHass(true)
    expect(await listsCard({ users: { [hass.user!.id]: { hide_pages: ['lists'] } } }, hass)).toBeUndefined()
  })

  it('belong to the household, so a room filter keeps them', async () => {
    expect(await listsCard({ areas: ['wohnzimmer'] })).toBeDefined()
  })

  it('without any list only admins get the page, to add the first one', async () => {
    const empty = () => {
      const hass = createHass(true)
      for (const id of Object.keys(hass.states).filter(id => id.startsWith('todo.'))) delete hass.states[id]
      return hass
    }
    expect(await listsCard({}, empty())).toBeDefined()
    const guest = empty()
    guest.user = { id: 'g', name: 'Gast', is_admin: false }
    expect(await listsCard({}, guest)).toBeUndefined()
  })
})

describe('appliances and TVs', () => {
  const cardsOf = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])

  it('gives each room its appliance cards and takes their read-outs out of the groups', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const kitchen = cardsOf(views.find(v => v.path === 'area-kuche')!)
    expect(kitchen.filter(c => c.type === 'custom:ad-appliance').map(c => c.appliance.name)).toEqual(['Geschirrspüler'])
    const tiles = kitchen.filter(c => c.type === 'custom:ad-tile').map(c => c.entity)
    expect(tiles.some(id => id.startsWith('sensor.geschirrspuler') || id.startsWith('select.geschirrspuler'))).toBe(false)
    // Its switches stay
    expect(tiles).toContain('switch.geschirrspuler_intensivzone')
  })

  it('lists every appliance on Home, each showing only while it is busy', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', appliances: [{ status: 'sensor.trockner_leistung', name: 'Trockner' }] }, createHass(true))
    const home = cardsOf(views[0]!).filter(c => c.type === 'custom:ad-appliance')
    expect(home.map(c => [c.appliance.name, c.only_active])).toEqual([['Geschirrspüler', true], ['Trockner', true], ['Waschmaschine', true]])
  })

  it('shows one TV card per set and leaves both players off the room page', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const living = cardsOf(views.find(v => v.path === 'area-wohnzimmer')!)
    expect(living.filter(c => c.type === 'custom:ad-tv').map(c => c.tv.entity)).toEqual(['media_player.tv_wohnzimmer'])
    expect(living.filter(c => c.type === 'custom:ad-tile').map(c => c.entity).filter(id => id.includes('tv_wohnzimmer'))).toEqual([])
  })
})

describe('calendar page', () => {
  const cardsOf = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards)

  it('collects every calendar on its own page in the nav', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    const page = views.find(v => v.path === 'calendar')!
    expect(cardsOf(page).find(c => c.type === 'custom:ad-calendar')!.entities).toEqual(['calendar.familie', 'calendar.abfall', 'calendar.feiertage'])
    expect(cardsOf(views[0]!).find(c => c.type === 'custom:ad-nav-bar')!.items.map((i: { path: string }) => i.path)).toContain('calendar')
  })

  it('takes the picked calendars, and drops the page with hide_domains or a user rule', async () => {
    const picked = await generateDashboard({ type: 'custom:auto-dashboard', calendars: ['calendar.abfall'] }, createHass(true))
    expect(cardsOf(picked.views.find(v => v.path === 'calendar')!).find(c => c.type === 'custom:ad-calendar')!.entities).toEqual(['calendar.abfall'])
    const hidden = await generateDashboard({ type: 'custom:auto-dashboard', hide_domains: ['calendar'] }, createHass(true))
    expect(hidden.views.map(v => v.path)).not.toContain('calendar')
    const hass = createHass(true)
    const ruled = await generateDashboard({ type: 'custom:auto-dashboard', users: { [hass.user!.id]: { hide_pages: ['calendar'] } } }, hass)
    expect(ruled.views.map(v => v.path)).not.toContain('calendar')
  })

  it('lets the calendar card change events unless calendar_edit is false', async () => {
    const card = async (extra = {}) => cardsOf((await generateDashboard({ type: 'custom:auto-dashboard', ...extra }, createHass(true))).views.find(v => v.path === 'calendar')!).find(c => c.type === 'custom:ad-calendar')!
    expect((await card()).edit).toBeUndefined()
    expect((await card({ calendar_edit: false })).edit).toBe(false)
  })
})

describe('face', () => {
  const navFace = async (config: Record<string, unknown>, hass = createHass(true)) => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', ...config }, hass)
    const nav = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).find(c => c.type === 'custom:ad-nav-bar')!
    return nav.face
  }

  it('is off unless asked for', async () => {
    expect(await navFace({})).toBeUndefined()
  })

  it('comes with the nav bar on every page, with the weather and the calendars', async () => {
    const face = await navFace({ face: {}, background_image: '/local/garten.jpg' })
    expect(face).toMatchObject({ after: 120, style: 'clock', image: '/local/garten.jpg' })
    expect(face.weather).toMatch(/^weather\./)
    expect(face.calendars.length).toBeGreaterThan(0)
    expect(await navFace({ face: { after: 0, style: 'photo' } })).toMatchObject({ after: 0, style: 'photo' })
  })

  it('a user gets their own face, or none', async () => {
    const hass = createHass(true)
    const id = hass.user!.id
    expect(await navFace({ users: { [id]: { face: { style: 'analog', after: 30 } } } }, hass)).toMatchObject({ style: 'analog', after: 30 })
    expect(await navFace({ face: { style: 'calendar' }, users: { [id]: { face: { after: 60 } } } }, hass)).toMatchObject({ style: 'calendar', after: 60 })
    expect(await navFace({ face: { style: 'calendar' }, users: { [id]: { face: false } } }, hass)).toBeUndefined()
  })

  it('knows the appliances, so it can show what runs', async () => {
    const face = await navFace({ face: {} })
    expect(face.appliances.map((a: { kind: string }) => a.kind)).toContain('dishwasher')
    expect(await navFace({ face: {}, hide_domains: ['appliance'] })).not.toHaveProperty('appliances')
  })
})

describe('cameras', () => {
  const hass = createHass(true)
  const cams = findCameras(hass, Object.values(hass.states).filter(e => e.entity_id.startsWith('camera.')))
  const door = cams.find(c => c.name === 'Haustür')!

  it('one camera per device, the sub stream rather than the main stream or the snapshots', () => {
    expect(cams.filter(c => c.entity.startsWith('camera.haustur'))).toHaveLength(1)
    expect(door.entity).toBe('camera.haustur_standardauflosung')
    expect(door.area).toBe('eingangstur')
  })

  it('knows what each sensor of the device detects, and leaves out the sleep state', () => {
    expect(Object.fromEntries(door.detections!.map(d => [d.entity, d.kind]))).toEqual({
      'binary_sensor.haustur_person': 'person', 'binary_sensor.haustur_paket': 'package',
      'binary_sensor.haustur_besucher': 'visitor', 'binary_sensor.haustur_bewegung': 'motion',
    })
    expect(cams.find(c => c.name === 'Esszimmer')!.detections).toBeUndefined()
  })

  it('reads a sensor without the device name, so a doorbell called Türklingel does not ring on motion', () => {
    const sensor = (id: string, name: string, device_class?: string) => ({ entity_id: id, state: 'off', attributes: { friendly_name: name, ...(device_class ? { device_class } : {}) } }) as any
    const names = ['Türklingel', 'Doorbell']
    expect(detectionKind(sensor('binary_sensor.front_door_bewegung_2', 'Türklingel Bewegung', 'motion'), names)).toBe('motion')
    expect(detectionKind(sensor('binary_sensor.front_door_person_2', 'Türklingel Person'), names)).toBe('person')
    expect(detectionKind(sensor('binary_sensor.turklingel_tier', 'Türklingel Tier'), names)).toBe('animal')
    expect(detectionKind(sensor('binary_sensor.front_door_besucher_2', 'Türklingel Besucher'), names)).toBe('visitor')
    expect(detectionKind(sensor('binary_sensor.eingangstur_doorbell_manipulation', 'Türklingel Manipulation', 'tamper'), names)).toBeUndefined()
  })

  it('takes the floodlight of the camera and the lights of its room', () => {
    expect(door.lights).toEqual(['light.haustur'])
    expect(cams.find(c => c.name === 'Terrasse')!.lights).toEqual(['light.terrasse_flutlicht'])
  })

  it('counts each switch to on once, and drops motion beside a detection that tells more', () => {
    const since = Date.UTC(2026, 10, 8)
    const at = (min: number) => since / 1000 + min * 60
    const history = {
      'binary_sensor.haustur_bewegung': [{ s: 'off', lu: at(0) }, { s: 'on', lu: at(600) }, { s: 'off', lu: at(601) }, { s: 'on', lu: at(700) }, { s: 'off', lu: at(701) }],
      'binary_sensor.haustur_paket': [{ s: 'off', lu: at(0) }, { s: 'on', lu: at(600.5) }, { s: 'off', lu: at(602) }],
      'binary_sensor.haustur_person': [{ s: 'on', lu: at(0) }, { s: 'off', lu: at(10) }, { s: 'on', lu: at(800) }, { s: 'off', lu: at(800.5) }, { s: 'on', lu: at(801) }],
    }
    const found = detectionsFrom(history, [door], since)
    expect(found.map(d => [d.kind, (d.at / 1000 - since / 1000) / 60])).toEqual([['person', 800], ['motion', 700], ['package', 600.5]])
  })
})
