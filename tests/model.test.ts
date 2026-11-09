import { describe, expect, it } from 'vitest'
import type { HassEntity, HomeAssistant } from '../src/types'
import { areaEntities, arrangeRoom, averageClimate, housePower, powerSources, batteryEntities, bulkControl, coverKind, powerW, roomPower, favoriteEntities, isRoomFavorite, replaceFavorites, floorsWithAreas, groupEntities, homeStatus, isOutlet, isScreenLight, groupOf, quickGroups, roomSummary, sceneEntities, unavailableDevices } from '../src/model'
import { entityIcon, shortName, stateColor } from '../src/presentation'
import { PALETTE_VARS, haGlassVars, haThemeVars, paletteVars, parseHex } from '../src/styles/palette'

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id, state, attributes: { friendly_name: entity_id, ...attributes } })

function fakeHass(): HomeAssistant {
  const states = [
    st('light.wz_decke', 'on'),
    st('light.kueche', 'off'),
    st('climate.wz', 'heat', { current_temperature: 21.4, hvac_action: 'heating' }),
    st('binary_sensor.wz_fenster', 'on', { device_class: 'window' }),
    st('sensor.wz_temp', '21.3', { device_class: 'temperature', unit_of_measurement: '°C' }),
    st('sensor.wz_batt', '12', { device_class: 'battery', unit_of_measurement: '%' }),
    st('sensor.hidden', '1', { unit_of_measurement: 'x' }),
    st('switch.diag', 'on'),
    st('light.flur', 'on'),
  ]
  return {
    states: Object.fromEntries(states.map(s => [s.entity_id, s])),
    entities: {
      'light.wz_decke': { entity_id: 'light.wz_decke', device_id: 'dev_wz' },
      'light.kueche': { entity_id: 'light.kueche', area_id: 'kueche' },
      'climate.wz': { entity_id: 'climate.wz', area_id: 'wohnzimmer' },
      'binary_sensor.wz_fenster': { entity_id: 'binary_sensor.wz_fenster', area_id: 'wohnzimmer' },
      'sensor.wz_temp': { entity_id: 'sensor.wz_temp', area_id: 'wohnzimmer' },
      'sensor.wz_batt': { entity_id: 'sensor.wz_batt', area_id: 'wohnzimmer', entity_category: 'diagnostic' },
      'sensor.hidden': { entity_id: 'sensor.hidden', area_id: 'wohnzimmer', labels: ['ad_hide'] },
      'switch.diag': { entity_id: 'switch.diag', area_id: 'wohnzimmer', entity_category: 'config' },
      'light.flur': { entity_id: 'light.flur', area_id: 'flur' },
    },
    devices: { dev_wz: { id: 'dev_wz', area_id: 'wohnzimmer' } },
    areas: {
      wohnzimmer: { area_id: 'wohnzimmer', name: 'Wohnzimmer', floor_id: 'eg' },
      kueche: { area_id: 'kueche', name: 'Küche', floor_id: 'eg' },
      flur: { area_id: 'flur', name: 'Flur' },
      bad: { area_id: 'bad', name: 'Bad', floor_id: 'og' },
      leer: { area_id: 'leer', name: 'Leer', floor_id: 'og' },
    },
    floors: {
      eg: { floor_id: 'eg', name: 'Erdgeschoss', level: 0 },
      og: { floor_id: 'og', name: 'Obergeschoss', level: 1 },
    },
    themes: { darkMode: true },
    language: 'de',
    callService: async () => undefined,
  }
}

describe('areaEntities', () => {
  it('takes the area from the device when the entity has none', () => {
    const ids = areaEntities(fakeHass(), 'wohnzimmer').map(e => e.entity_id)
    expect(ids).toContain('light.wz_decke')
  })

  it('drops hidden, labelled and categorised entities', () => {
    const ids = areaEntities(fakeHass(), 'wohnzimmer').map(e => e.entity_id)
    expect(ids).not.toContain('sensor.hidden')
    expect(ids).not.toContain('switch.diag')
    expect(ids).not.toContain('sensor.wz_batt')
  })

  it('respects hide_domains', () => {
    const ids = areaEntities(fakeHass(), 'wohnzimmer', { domains: ['light'] }).map(e => e.entity_id)
    expect(ids).not.toContain('light.wz_decke')
  })

  it('hides entities whose own, device or area labels match hide_labels', () => {
    const hass = fakeHass()
    hass.entities['climate.wz']!.labels = ['gast']
    hass.devices.dev_wz!.labels = ['gast']
    hass.areas.flur!.labels = ['gast']
    const ids = areaEntities(hass, 'wohnzimmer', { labels: ['gast'] }).map(e => e.entity_id)
    expect(ids).not.toContain('climate.wz')
    expect(ids).not.toContain('light.wz_decke')
    expect(ids).toContain('sensor.wz_temp')
    expect(areaEntities(hass, 'flur', { labels: ['gast'] })).toEqual([])
    expect(floorsWithAreas(hass, { hide_labels: ['gast'] }).flatMap(f => f.areas).map(a => a.area_id)).not.toContain('flur')
    // Without the option, labels change nothing
    expect(areaEntities(hass, 'wohnzimmer').map(e => e.entity_id)).toContain('climate.wz')
  })
})

describe('floorsWithAreas', () => {
  it('sorts floors top-down, skips empty areas, puts floorless last', () => {
    const groups = floorsWithAreas(fakeHass())
    expect(groups.map(g => g.floor?.floor_id ?? null)).toEqual(['eg', null])
    expect(groups[0]!.areas.map(a => a.area_id)).toEqual(['kueche', 'wohnzimmer'])
    expect(groups[1]!.areas.map(a => a.area_id)).toEqual(['flur'])
  })

  it('applies area_order and hide_areas', () => {
    const groups = floorsWithAreas(fakeHass(), { area_order: ['wohnzimmer'], hide_areas: ['flur'] })
    expect(groups[0]!.areas.map(a => a.area_id)).toEqual(['wohnzimmer', 'kueche'])
    expect(groups).toHaveLength(1)
  })
})

describe('groupEntities', () => {
  it('orders groups for a room page', () => {
    const groups = groupEntities(areaEntities(fakeHass(), 'wohnzimmer'))
    expect([...groups.keys()]).toEqual(['light', 'climate', 'opening', 'sensor'])
  })
})

describe('roomSummary', () => {
  it('picks lights, climate, temperature and openings', () => {
    const summary = roomSummary(areaEntities(fakeHass(), 'wohnzimmer'))
    expect(summary.lights.map(e => e.entity_id)).toEqual(['light.wz_decke'])
    expect(summary.climate?.entity_id).toBe('climate.wz')
    // The thermostat measures the room; it comes before loose sensors
    expect(summary.temperature).toMatchObject({ value: 21.4, entity: { entity_id: 'climate.wz' } })
    expect(summary.status.map(e => e.entity_id)).toEqual(['binary_sensor.wz_fenster'])
  })
})

describe('isOutlet', () => {
  it('knows sockets by device class or name, not other switches', () => {
    expect(isOutlet(st('switch.kuehlschrank', 'on', { device_class: 'outlet' }))).toBe(true)
    expect(isOutlet(st('switch.steckdose_am_lichtschalter', 'on', {}))).toBe(true)
    expect(isOutlet(st('switch.x', 'on', { friendly_name: 'Shelly Plug S' }))).toBe(true)
    expect(isOutlet(st('switch.kindersicherung', 'on', {}))).toBe(false)
    expect(isOutlet(st('light.steckdose', 'on', {}))).toBe(false)
    // A plug's own settings are no sockets
    expect(isOutlet(st('switch.waschmaschine_child_lock', 'on', { friendly_name: 'Steckdose Waschmaschine Kindersicherung' }))).toBe(false)
    expect(isOutlet(st('switch.shellyplug_s_internet', 'on', { friendly_name: 'shellyplug-s Internet' }))).toBe(false)
    expect(isOutlet(st('switch.smart_switch_config_overtemp_enable', 'on', { friendly_name: 'Smart Plug Overheat alert' }))).toBe(false)
  })
})

describe('homeStatus', () => {
  it('counts what is on, open, heating and low on battery', () => {
    const hass = fakeHass()
    const items = homeStatus(Object.values(hass.states), batteryEntities(hass))
    const counts = Object.fromEntries(items.map(i => [i.key, i.entities.length]))
    expect(counts).toEqual({ lights: 2, openings: 1, heating: 1, battery: 1 })
  })

  it('shows motion or presence only when asked, as on a room page', () => {
    const entities = [st('binary_sensor.bad_bewegung', 'on', { device_class: 'motion' }), st('binary_sensor.bad_radar', 'off', { device_class: 'occupancy' }), st('binary_sensor.bad_fenster', 'on', { device_class: 'window' })]
    expect(homeStatus(entities).map(i => i.key)).toEqual(['openings'])
    const items = homeStatus(entities, [], [], { presence: true })
    expect(items.map(i => i.key)).toEqual(['presence', 'openings'])
    expect(items[0]!.entities.map(e => e.entity_id)).toEqual(['binary_sensor.bad_bewegung'])
  })
})

describe('presentation', () => {
  it('uses device class icons and colors', () => {
    const window = st('binary_sensor.f', 'on', { device_class: 'window' })
    expect(entityIcon(window)).toBe('mdi:window-open-variant')
    expect(stateColor(window)).toBe('warning')
    expect(stateColor(st('light.x', 'off'))).toBe('muted')
  })

  it('strips the room name from entity names', () => {
    expect(shortName('Wohnzimmer Decke', 'Wohnzimmer')).toBe('Decke')
    expect(shortName('Wohnzimmer', 'Wohnzimmer')).toBe('Wohnzimmer')
    expect(shortName('Stehlampe', 'Wohnzimmer')).toBe('Stehlampe')
    expect(shortName('Garagentor', 'Garage')).toBe('Garagentor')
  })
})

describe('unavailableDevices', () => {
  it('counts a device once, only when all its entities are gone, and only inside areas', () => {
    const hass = fakeHass()
    const add = (id: string, state: string, entry: Record<string, unknown>) => {
      hass.states[id] = st(id, state)
      hass.entities[id] = { entity_id: id, ...entry }
    }
    hass.devices.dead = { id: 'dead', area_id: 'kueche' }
    hass.devices.half = { id: 'half', area_id: 'kueche' }
    add('sensor.dead_a', 'unavailable', { device_id: 'dead' })
    add('sensor.dead_b', 'unavailable', { device_id: 'dead' })
    add('sensor.half_a', 'unavailable', { device_id: 'half' })
    add('sensor.half_b', '3', { device_id: 'half' })
    add('switch.loose', 'unavailable', { area_id: 'flur' })
    add('switch.nowhere', 'unavailable', {})
    expect(unavailableDevices(hass).map(e => e.entity_id)).toEqual(['sensor.dead_a', 'switch.loose'])
  })
})

describe('room controls', () => {
  it('prefers the sensors picked for the area', () => {
    const hass = fakeHass()
    hass.states['sensor.other_temp'] = st('sensor.other_temp', '19', { device_class: 'temperature' })
    const area = { ...hass.areas.wohnzimmer!, temperature_entity_id: 'sensor.other_temp' }
    expect(roomSummary(areaEntities(hass, 'wohnzimmer'), area, hass.states).temperature?.entity.entity_id).toBe('sensor.other_temp')
    expect(roomSummary(areaEntities(hass, 'wohnzimmer')).temperature?.entity.entity_id).toBe('climate.wz')
  })

  it('without a thermostat takes the first working sensor, skipping unavailable ones', () => {
    const entities = [
      st('sensor.broken', 'unavailable', { device_class: 'temperature' }),
      st('sensor.ok', '19.5', { device_class: 'temperature', unit_of_measurement: '°C' }),
    ]
    expect(roomSummary(entities).temperature).toMatchObject({ value: 19.5, unit: '°C', entity: { entity_id: 'sensor.ok' } })
  })

  it('quick groups collect lights, switches and covers', () => {
    const entities = [st('light.a', 'on'), st('fan.b', 'off'), st('switch.c', 'on', { device_class: 'outlet' }), st('switch.child_lock', 'on'), st('cover.d', 'open'), st('sensor.e', '1')]
    // Device settings like a child lock never join "all off"
    expect(quickGroups(entities).map(g => [g.key, g.entities.map(e => e.entity_id)])).toEqual([
      ['light', ['light.a']], ['switch', ['fan.b', 'switch.c']], ['shading', ['cover.d']],
    ])
  })

  it('splits covers by what they do', () => {
    const entities = [
      st('cover.blind', 'open'), st('cover.awning', 'open', { device_class: 'awning' }),
      st('cover.window', 'open', { device_class: 'window' }), st('cover.garage', 'closed', { device_class: 'garage' }),
      st('binary_sensor.garage', 'off', { device_class: 'garage_door' }), st('binary_sensor.pir', 'on', { device_class: 'motion' }),
      st('binary_sensor.smoke', 'off', { device_class: 'smoke' }), st('select.mode', 'a'),
    ]
    expect(Object.fromEntries([...groupEntities(entities)].map(([k, v]) => [k, v.map(e => e.entity_id)]))).toEqual({
      shading: ['cover.blind'],
      awning: ['cover.awning'],
      opening: ['cover.window'],
      gate: ['binary_sensor.garage', 'cover.garage'],
      select: ['select.mode'],
      motion: ['binary_sensor.pir'],
      safety: ['binary_sensor.smoke'],
    })
    expect(quickGroups(entities).map(g => g.key)).toEqual(['shading', 'awning', 'opening', 'gate'])
    // Blinds never share an "all down" with the garage door or the awning
    expect(bulkControl([entities[0]!, entities[3]!]).control).toBeUndefined()
    expect(bulkControl([entities[0]!, entities[1]!]).control).toBeUndefined()
    expect(bulkControl([entities[0]!, st('cover.blind2', 'closed')]).control).toBe('cover')
  })

  it('bulk control fits the group, and needs two entities', () => {
    expect(bulkControl([st('light.a', 'on'), st('switch.b', 'off', { device_class: 'outlet' })]).control).toBe('toggle')
    expect(bulkControl([st('switch.a', 'on'), st('switch.b', 'off')]).control).toBeUndefined()
    const mixed = bulkControl([st('switch.p1', 'on', { device_class: 'outlet' }), st('switch.p2', 'on', { device_class: 'outlet' }), st('switch.lock', 'on')])
    expect(mixed).toMatchObject({ control: 'toggle' })
    expect(mixed.entities.map(e => e.entity_id)).toEqual(['switch.p1', 'switch.p2'])
    expect(bulkControl([st('cover.a', 'open'), st('cover.b', 'closed')]).control).toBe('cover')
    expect(bulkControl([st('light.a', 'on')]).control).toBeUndefined()
    expect(bulkControl([st('climate.a', 'heat'), st('sensor.b', '1')]).control).toBeUndefined()
    const security = bulkControl([st('lock.a', 'locked'), st('lock.b', 'locked'), st('binary_sensor.c', 'off')])
    expect(security).toMatchObject({ control: 'lock' })
    expect(security.entities.map(e => e.entity_id)).toEqual(['lock.a', 'lock.b'])
  })

  it('keeps awnings apart from blinds, by class or by name', () => {
    const blind = st('cover.rollo', 'open', { device_class: 'shutter', friendly_name: 'Rollo Terrasse' })
    const named = st('cover.shelly_1', 'closed', { device_class: 'shutter', friendly_name: 'Große Markise' })
    const classed = st('cover.b', 'closed', { device_class: 'awning', friendly_name: 'Sonnenschutz' })
    expect([blind, named, classed].map(coverKind)).toEqual(['shading', 'awning', 'awning'])
    expect(bulkControl([named, classed]).control).toBe('awning')
    expect(bulkControl([blind, named]).control).toBeUndefined()
    expect(quickGroups([blind, named, classed]).map(g => g.key)).toEqual(['shading', 'awning'])
    expect(coverKind(st('cover.g', 'closed', { device_class: 'garage', friendly_name: 'Markise Garage' }))).toBe('gate')
  })
})

describe('favorites and scenes', () => {
  it('keeps favorites that exist and lie in the dashboard rooms', () => {
    const hass = fakeHass()
    hass.states['script.x'] = st('script.x', 'off')
    const ids = favoriteEntities(hass, ['light.flur', 'light.kueche', 'light.gone', 'script.x'], ['flur']).map(e => e.entity_id)
    expect(ids).toEqual(['light.flur', 'script.x'])
  })

  it('shows every visible scene unless scenes and scripts are picked', () => {
    const hass = fakeHass()
    hass.states['scene.b'] = st('scene.b', '2026-01-01T00:00:00Z', { friendly_name: 'B' })
    hass.states['scene.a'] = st('scene.a', '2026-01-01T00:00:00Z', { friendly_name: 'A' })
    hass.states['script.s'] = st('script.s', 'off')
    hass.entities['scene.b'] = { entity_id: 'scene.b', area_id: 'flur' }
    hass.entities['scene.a'] = { entity_id: 'scene.a' }
    hass.entities['script.s'] = { entity_id: 'script.s' }
    expect(sceneEntities(hass, undefined).map(e => e.entity_id)).toEqual(['scene.a', 'scene.b'])
    expect(sceneEntities(hass, undefined, { domains: ['scene'] })).toEqual([])
    expect(sceneEntities(hass, ['script.s', 'light.flur']).map(e => e.entity_id)).toEqual(['script.s'])
  })
})

describe('energy and climate', () => {
  it('reads power in watts and sums rooms, biggest first', () => {
    expect(powerW(st('sensor.a', '1.5', { device_class: 'power', unit_of_measurement: 'kW' }))).toBe(1500)
    expect(powerW(st('sensor.a', 'unknown', { device_class: 'power' }))).toBeUndefined()
    expect(powerW(st('sensor.a', '5', { device_class: 'energy' }))).toBeUndefined()
    const hass = fakeHass()
    hass.states['sensor.wz_p'] = st('sensor.wz_p', '100', { device_class: 'power', unit_of_measurement: 'W' })
    hass.states['sensor.k_p'] = st('sensor.k_p', '0.4', { device_class: 'power', unit_of_measurement: 'kW' })
    hass.entities['sensor.wz_p'] = { entity_id: 'sensor.wz_p', area_id: 'wohnzimmer' }
    hass.entities['sensor.k_p'] = { entity_id: 'sensor.k_p', area_id: 'kueche' }
    const rooms = roomPower(hass, Object.values(hass.areas))
    expect(rooms.map(r => [r.area.area_id, r.total])).toEqual([['kueche', 400], ['wohnzimmer', 100]])
  })

  it('averages the rooms', () => {
    const hass = fakeHass()
    hass.states['sensor.k_t'] = st('sensor.k_t', '19.3', { device_class: 'temperature', unit_of_measurement: '°C' })
    hass.entities['sensor.k_t'] = { entity_id: 'sensor.k_t', area_id: 'kueche' }
    const avg = averageClimate(hass, [hass.areas.wohnzimmer!, hass.areas.kueche!, hass.areas.flur!])
    expect(avg.temperature).toBeCloseTo(20.35)
    expect(avg.humidity).toBeUndefined()
  })
})

describe('palette', () => {
  it('derives every variable for dark and light from one color', () => {
    for (const dark of [true, false]) {
      const vars = paletteVars('#0ea5e9', dark)!
      expect(Object.keys(vars).sort()).toEqual([...PALETTE_VARS].sort())
    }
    expect(paletteVars('nope', true)).toBeUndefined()
    expect(parseHex('#abc')).toEqual([170, 187, 204])
  })

  it('keeps the default look close to the built-in slate and indigo', () => {
    const dark = paletteVars('#6366f1', true)!
    const [r, g, b] = dark['--ad-primary'].split(',').map(Number)
    expect(Math.abs(r! - 99) + Math.abs(g! - 102) + Math.abs(b! - 241)).toBeLessThan(30)
    expect(dark['--ad-surface']).toMatch(/^rgb\(/)
  })

  it('a grey accent gives plain greys, a light accent gets dark text', () => {
    const grey = paletteVars('#808080', true)!
    const [r, g, b] = grey['--ad-surface'].slice(4, -1).split(',').map(Number)
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(paletteVars('#fde047', false)!['--ad-on-primary']).toBe('15, 23, 42')
    expect(paletteVars('#1e3a8a', true)!['--ad-on-primary']).toBe('255, 255, 255')
  })
})

describe('room settings', () => {
  const groups = () => groupEntities([
    st('light.b', 'on', { friendly_name: 'B' }), st('light.a', 'on', { friendly_name: 'A' }), st('light.c', 'on', { friendly_name: 'C' }),
    st('switch.s', 'on'), st('sensor.t', '20', { device_class: 'temperature', unit_of_measurement: '°C' }),
  ])

  it('without settings keeps the default order', () => {
    expect(arrangeRoom(groups()).map(([k, list]) => [k, list.map(e => e.entity_id)])).toEqual([
      ['light', ['light.a', 'light.b', 'light.c']], ['switch', ['switch.s']], ['sensor', ['sensor.t']],
    ])
  })

  it('hides groups and puts groups and entities in the chosen order', () => {
    const out = arrangeRoom(groups(), { hide_groups: ['switch'], group_order: ['sensor'], order: ['light.c', 'light.a'] })
    expect(out.map(([k, list]) => [k, list.map(e => e.entity_id)])).toEqual([
      ['sensor', ['sensor.t']], ['light', ['light.c', 'light.a', 'light.b']],
    ])
  })

  it('hide_entities removes single entities everywhere', () => {
    const ids = areaEntities(fakeHass(), 'wohnzimmer', { entities: ['climate.wz'] }).map(e => e.entity_id)
    expect(ids).not.toContain('climate.wz')
    expect(ids).toContain('sensor.wz_temp')
  })
})

describe('energy settings', () => {
  const hass = () => {
    const h = fakeHass()
    h.states['sensor.grid'] = st('sensor.grid', '1.2', { unit_of_measurement: 'kW' })
    h.states['sensor.pv'] = st('sensor.pv', '800', { unit_of_measurement: 'W' })
    h.states['sensor.house'] = st('sensor.house', '1500', { unit_of_measurement: 'W' })
    return h
  }

  it('keeps sources with an existing power sensor', () => {
    const sources = powerSources(hass(), { energy_sources: [
      { type: 'grid', stat_rate: 'sensor.grid' }, { type: 'solar', stat_rate: 'sensor.gone' }, { type: 'gas', stat_rate: 'sensor.pv' }, { type: 'solar' },
    ] })
    expect(sources).toEqual({ grid: ['sensor.grid'] })
    expect(powerSources(hass(), undefined)).toBeUndefined()
  })

  it('ignores several grid power sensors: they are plugs, not the house', () => {
    const h = hass()
    h.states['sensor.plug'] = st('sensor.plug', '50', { unit_of_measurement: 'W' })
    expect(powerSources(h, { energy_sources: [
      { type: 'grid', stat_rate: 'sensor.grid' }, { type: 'grid', stat_rate: 'sensor.plug' }, { type: 'solar', stat_rate: 'sensor.pv' },
    ] })).toBeUndefined()
    expect(powerSources(h, { energy_sources: [
      { type: 'grid', stat_rate: 'sensor.grid' }, { type: 'grid', stat_rate: 'sensor.plug' }, { type: 'home', stat_rate: 'sensor.house' },
    ] })).toEqual({ home: ['sensor.house'] })
    expect(powerSources(h, { energy_sources: [{ type: 'grid', stat_rate: 'sensor.grid' }, { type: 'grid' }, { type: 'solar', stat_rate: 'sensor.pv' }] }))
      .toEqual({ grid: ['sensor.grid'], solar: ['sensor.pv'] })
    // Four plugs as grid, three of them gone: still ambiguous
    expect(powerSources(h, { energy_sources: [
      { type: 'grid', stat_rate: 'sensor.grid' }, { type: 'grid', stat_rate: 'sensor.gone1' }, { type: 'grid', stat_rate: 'sensor.gone2' },
    ] })).toBeUndefined()
  })

  it('the house is the home sensor, else grid + solar + battery', () => {
    expect(housePower(hass(), { grid: ['sensor.grid'], solar: ['sensor.pv'] })).toMatchObject({ total: 2000, grid: 1200, solar: 800 })
    expect(housePower(hass(), { home: ['sensor.house'], grid: ['sensor.grid'] })!.total).toBe(1500)
    expect(housePower(hass(), undefined)).toBeUndefined()
  })
})

describe('HA theme from the accent', () => {
  it('colors header, sidebar and dialogs like the cards', () => {
    const vars = haThemeVars('#14b8a6', true)!
    const cards = paletteVars('#14b8a6', true)!
    expect(vars['--app-header-background-color']).toBe(cards['--ad-bg'])
    expect(vars['--card-background-color']).toBe(cards['--ad-surface'])
    expect(vars['--primary-color']).toBe(`rgb(${cards['--ad-primary']})`)
    expect(haThemeVars('kaputt', true)).toBeUndefined()
  })

  it('turns the built-in HA cards to the same glass as ours', () => {
    expect(haGlassVars('#14b8a6', true)['--ha-card-background']).toBe(paletteVars('#14b8a6', true)!['--ad-glass-bg'])
    expect(haGlassVars(undefined, false)['--ha-card-backdrop-filter']).toMatch(/^blur\(/)
  })
})

describe('favorite rooms', () => {
  it('tells rooms from devices by the dot of entity ids', () => {
    expect(isRoomFavorite('kuche')).toBe(true)
    expect(isRoomFavorite('light.kuche')).toBe(false)
  })

  it('replaces one kind and keeps the other where it was', () => {
    const list = ['light.a', 'kuche', 'switch.b', 'bad']
    expect(replaceFavorites(list, true, ['bad', 'flur'])).toEqual(['light.a', 'bad', 'switch.b', 'flur'])
    expect(replaceFavorites(list, false, ['switch.b'])).toEqual(['switch.b', 'kuche', 'bad'])
  })
})

describe('screen lights', () => {
  const hass = (entityId: string, friendly_name: string) => ({
    states: { [entityId]: st(entityId, 'on', { friendly_name }) },
    entities: { [entityId]: { entity_id: entityId, area_id: 'kueche' } },
    devices: {}, areas: { kueche: { area_id: 'kueche', name: 'Küche' } },
  }) as unknown as HomeAssistant

  it('treats a tablet or display brightness as a device setting, not a lamp', () => {
    const tablet = hass('light.samsung_sm_x200_screen', 'Wandtablet Screen')
    expect(isScreenLight(tablet, 'light.samsung_sm_x200_screen')).toBe(true)
    expect(areaEntities(tablet, 'kueche')).toEqual([])
    expect(isScreenLight(hass('light.tablet', 'Küche Bildschirm'), 'light.tablet')).toBe(true)
    expect(isScreenLight(hass('light.tv_backlight', 'TV'), 'light.tv_backlight')).toBe(true)
  })

  it('keeps lamps whose names only contain the letters', () => {
    expect(isScreenLight(hass('light.screenplay_lampe', 'Leselampe'), 'light.screenplay_lampe')).toBe(false)
    expect(isScreenLight(hass('light.kuche', 'Küchenlicht'), 'light.kuche')).toBe(false)
    expect(isScreenLight(hass('switch.screen', 'Screen'), 'switch.screen')).toBe(false)
  })
})

describe('buttons', () => {
  const button = (entity_id: string, friendly_name: string, device_class?: string) =>
    st(entity_id, 'unknown', { friendly_name, ...(device_class ? { device_class } : {}) })

  it('puts buttons that do something into their own group', () => {
    expect(groupOf(button('button.wake_on_lan_palmi', 'Palmi Wake UP'))).toBe('button')
    expect(groupOf(button('button.dryer_zyklus_anhalten', 'Trockner Zyklus anhalten'))).toBe('button')
    expect(groupOf(st('input_button.klingel', 'unknown'))).toBe('button')
  })

  it('leaves out buttons that keep a device running', () => {
    for (const [id, name, dc] of [
      ['button.lampe_identify', 'Lampe Identifizieren'], ['button.spots_reboot', 'Spots Neustart'],
      ['button.x', 'Thermostat Batterie ersetzt'], ['button.y', 'Restart', 'restart'], ['button.z', 'Deckenlicht Request Platform API State'],
      ['button.rauchmelder_selbsttest', 'Rauchmelder Selbsttest'],
    ] as [string, string, string?][]) expect(groupOf(button(id, name, dc)), name).toBeUndefined()
  })

  it('keeps a wall tablet\'s own buttons out together with its screen', () => {
    const hass = {
      states: Object.fromEntries([button('button.tablet_reload_page', 'Wandtablet Reload page'), st('light.tablet_screen', 'on', { friendly_name: 'Wandtablet Screen' }),
        button('button.kueche_nachlauf', 'Nachlauf')].map(e => [e.entity_id, e])),
      entities: {
        'button.tablet_reload_page': { entity_id: 'button.tablet_reload_page', device_id: 'tab' },
        'light.tablet_screen': { entity_id: 'light.tablet_screen', device_id: 'tab' },
        'button.kueche_nachlauf': { entity_id: 'button.kueche_nachlauf', area_id: 'kueche' },
      },
      devices: { tab: { id: 'tab', area_id: 'kueche' } }, areas: { kueche: { area_id: 'kueche', name: 'Küche' } },
    } as unknown as HomeAssistant
    expect(areaEntities(hass, 'kueche').map(e => e.entity_id)).toEqual(['button.kueche_nachlauf'])
  })
})
