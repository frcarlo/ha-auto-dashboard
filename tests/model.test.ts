import { describe, expect, it } from 'vitest'
import type { HassEntity, HomeAssistant } from '../src/types'
import { areaEntities, batteryEntities, floorsWithAreas, groupEntities, homeStatus, roomSummary } from '../src/model'
import { entityIcon, shortName, stateColor } from '../src/presentation'

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
    const ids = areaEntities(fakeHass(), 'wohnzimmer', ['light']).map(e => e.entity_id)
    expect(ids).not.toContain('light.wz_decke')
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
    expect([...groups.keys()]).toEqual(['light', 'climate', 'security', 'sensor'])
  })
})

describe('roomSummary', () => {
  it('picks lights, climate, temperature and openings', () => {
    const summary = roomSummary(areaEntities(fakeHass(), 'wohnzimmer'))
    expect(summary.lights.map(e => e.entity_id)).toEqual(['light.wz_decke'])
    expect(summary.climate?.entity_id).toBe('climate.wz')
    expect(summary.temperature?.entity_id).toBe('sensor.wz_temp')
    expect(summary.status.map(e => e.entity_id)).toEqual(['binary_sensor.wz_fenster'])
  })
})

describe('homeStatus', () => {
  it('counts what is on, open, heating and low on battery', () => {
    const hass = fakeHass()
    const items = homeStatus(Object.values(hass.states), batteryEntities(hass))
    const counts = Object.fromEntries(items.map(i => [i.key, i.entities.length]))
    expect(counts).toEqual({ lights: 2, openings: 1, heating: 1, battery: 1 })
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
  })
})
