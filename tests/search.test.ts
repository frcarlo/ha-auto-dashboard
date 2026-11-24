import { describe, expect, it } from 'vitest'
import type { HassEntity, HomeAssistant } from '../src/types'
import { fold, kindOfEntity, kindsFor, score, search, type SearchSettings } from '../src/search'

const st = (entity_id: string, state: string, friendly_name: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id, state, attributes: { friendly_name, ...attributes } })

function hass(): HomeAssistant {
  const states = [
    st('light.kueche_decke', 'off', 'Küche Decke'),
    st('light.wz_stehlampe', 'on', 'Stehlampe'),
    st('switch.kaffeemaschine', 'off', 'Kaffeemaschine'),
    st('sensor.kueche_temp', '21.5', 'Küche Temperatur', { unit_of_measurement: '°C', device_class: 'temperature' }),
    st('cover.wz_rollo', 'open', 'Wohnzimmer Rollo'),
    st('light.versteckt', 'on', 'Versteckt'),
    st('light.bad', 'on', 'Bad Spiegel'),
  ]
  return {
    states: Object.fromEntries(states.map(s => [s.entity_id, s])),
    entities: {
      'light.kueche_decke': { entity_id: 'light.kueche_decke', area_id: 'kueche' },
      'light.wz_stehlampe': { entity_id: 'light.wz_stehlampe', area_id: 'wohnzimmer' },
      'switch.kaffeemaschine': { entity_id: 'switch.kaffeemaschine', area_id: 'kueche' },
      'sensor.kueche_temp': { entity_id: 'sensor.kueche_temp', area_id: 'kueche' },
      'cover.wz_rollo': { entity_id: 'cover.wz_rollo', area_id: 'wohnzimmer' },
      'light.versteckt': { entity_id: 'light.versteckt', area_id: 'kueche', hidden: true },
      'light.bad': { entity_id: 'light.bad', area_id: 'bad' },
    },
    devices: {},
    areas: {
      kueche: { area_id: 'kueche', name: 'Küche' },
      wohnzimmer: { area_id: 'wohnzimmer', name: 'Wohnzimmer' },
      bad: { area_id: 'bad', name: 'Bad' },
    },
    floors: {},
    themes: { darkMode: false },
    language: 'de',
    callService: async () => undefined,
  } as unknown as HomeAssistant
}

const settings: SearchSettings = {
  rooms: [{ id: 'kueche', name: 'Küche', floor: 'EG' }, { id: 'wohnzimmer', name: 'Wohnzimmer', floor: 'EG' }, { id: 'bad', name: 'Bad', floor: 'OG' }],
}
const pages = [{ path: 'home', icon: 'mdi:home', label: 'Start' }, { path: 'lights', icon: 'mdi:lightbulb', label: 'Licht' }]

describe('fold', () => {
  it('drops case and accents, so umlauts can be typed plain', () => {
    expect(fold('Küche Straße')).toBe('kuche strasse')
  })
})

describe('score', () => {
  it('needs every word somewhere and ranks a title starting with the query first', () => {
    expect(score('kaffee', 'Kaffeemaschine')).toBeGreaterThan(score('maschine', 'Kaffeemaschine'))
    expect(score('decke kuche', 'Decke', 'Küche')).toBeGreaterThan(0)
    expect(score('decke bad', 'Decke', 'Küche')).toBe(0)
    expect(score('', 'Alles')).toBe(1)
  })
})

describe('search', () => {
  it('finds a room before the devices in it, and the devices by their room', () => {
    const hits = search(hass(), settings, pages, 'küche')
    expect(hits[0]).toMatchObject({ kind: 'room', id: 'kueche' })
    expect(hits.map(h => h.id)).toEqual(expect.arrayContaining(['light.kueche_decke', 'sensor.kueche_temp', 'switch.kaffeemaschine']))
    expect(hits.find(h => h.id === 'switch.kaffeemaschine')?.sub).toBe('Küche')
  })

  it('leaves out hidden entities and those outside the dashboard', () => {
    const ids = search(hass(), { ...settings, areas: ['kueche', 'wohnzimmer'] }, pages, 'a').map(h => h.id)
    expect(ids).not.toContain('light.versteckt')
    expect(ids).not.toContain('light.bad')
  })

  it('lists pages and rooms without a query, and all of a kind once one is chosen, switched-on first', () => {
    expect(search(hass(), settings, pages, '').map(h => h.kind)).toEqual(['page', 'page', 'room', 'room', 'room'])
    const lights = search(hass(), settings, pages, '', 'light')
    expect(lights.map(h => h.id)).toEqual(['light.bad', 'light.wz_stehlampe', 'light.kueche_decke'])
  })

  it('narrows a query to the chosen kind', () => {
    expect(search(hass(), settings, pages, 'küche', 'sensor').map(h => h.id)).toEqual(['sensor.kueche_temp'])
  })
})

describe('kindsFor', () => {
  it('offers only the kinds with hits, the chosen one always', () => {
    expect(kindsFor(hass(), settings, pages, 'rollo')).toEqual(['cover'])
    expect(kindsFor(hass(), settings, pages, 'rollo', 'light')).toEqual(['light', 'cover'])
    expect(kindOfEntity('input_boolean.gast')).toBe('switch')
    expect(kindOfEntity('automation.x')).toBe('other')
  })
})
