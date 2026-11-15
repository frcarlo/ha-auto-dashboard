import { describe, expect, it } from 'vitest'
import { inkColor, lowSupplies, printers } from '../src/printers'
import type { HomeAssistant } from '../src/types'

type E = [id: string, state: string, attributes: Record<string, unknown>, device?: string, extra?: Record<string, unknown>]

function hassOf(list: E[]): HomeAssistant {
  const states: HomeAssistant['states'] = {}
  const entities: HomeAssistant['entities'] = {}
  for (const [entity_id, state, attributes, device, extra] of list) {
    states[entity_id] = { entity_id, state, attributes }
    entities[entity_id] = { entity_id, device_id: device ?? null, labels: [], ...extra }
  }
  return {
    states, entities, areas: { buro: { area_id: 'buro', name: 'Büro' } }, themes: { darkMode: true }, language: 'de',
    devices: {
      brother: { id: 'brother', name: 'MFC-L3750CDW', name_by_user: 'Drucker', model: 'MFC-L3750CDW', area_id: 'buro' },
      epson: { id: 'epson', name: 'EPSON WF-3820', model: 'WF-3820 Series', area_id: 'buro' },
      washer: { id: 'washer', name: 'Waschmaschine' },
    },
    callService: async () => undefined,
  }
}

const pct = { unit_of_measurement: '%' }

describe('printers', () => {
  const hass = hassOf([
    ['sensor.mfc_verbleibender_gelb_toner', '49', { friendly_name: 'Drucker Gelb-Toner', ...pct }, 'brother', { translation_key: 'yellow_toner_remaining' }],
    ['sensor.mfc_verbleibender_schwarz_toner', '92', { friendly_name: 'Drucker Schwarz-Toner', ...pct }, 'brother'],
    ['sensor.mfc_verbleibender_cyan_toner', '8', { friendly_name: 'Drucker Cyan-Toner', ...pct }, 'brother'],
    ['sensor.mfc_restlebensdauer_der_cyan_trommel', '54', { friendly_name: 'Drucker Lebensdauer Cyan-Trommel', ...pct }, 'brother'],
    ['sensor.mfc_restlebensdauer_der_fixiereinheit', '84', { friendly_name: 'Drucker Lebensdauer Fixiereinheit', ...pct }, 'brother'],
    ['sensor.mfc_cyan_trommel_restseiten', '9658', { friendly_name: 'Drucker Restseiten Cyan-Trommel', unit_of_measurement: 'pages' }, 'brother'],
    ['sensor.mfc_druckerstatus', 'printing', { friendly_name: 'Drucker', device_class: 'enum' }, 'brother'],
    ['sensor.mfc_geratestatus', 'running', { friendly_name: 'Gerätestatus', device_class: 'enum' }, 'brother'],
    ['binary_sensor.mfc_kein_papier', 'on', { friendly_name: 'Drucker Kein Papier', device_class: 'problem' }, 'brother'],
    ['binary_sensor.mfc_papierstau', 'off', { friendly_name: 'Drucker Papierstau', device_class: 'problem' }, 'brother'],
    ['sensor.epson_black_ink', '73', { friendly_name: 'EPSON Black ink', marker_type: 'ink-cartridge', marker_low_level: 15, ...pct }, 'epson'],
    ['sensor.epson_cyan_ink', '12', { friendly_name: 'EPSON Cyan ink', marker_type: 'ink-cartridge', marker_low_level: 15, ...pct }, 'epson'],
    ['sensor.epson', 'idle', { friendly_name: 'EPSON', device_class: 'enum' }, 'epson'],
    // Not printers: a drum alone, a link quality, a cartridge without a device
    ['sensor.waschmaschine_trommel', '30', { friendly_name: 'Waschmaschine Trommel', ...pct }, 'washer'],
    ['sensor.deckenleuchte_linkquality', '25', { friendly_name: 'Deckenleuchte Linkquality', ...pct }, 'washer'],
    ['sensor.loose_toner', '40', { friendly_name: 'Toner', ...pct }],
  ])

  it('finds each printer with its cartridges in color order and its wear parts', () => {
    const [brother, epson] = printers(hass)
    expect(printers(hass)).toHaveLength(2)
    expect(brother!.name).toBe('Drucker')
    expect(brother!.supplies.map(c => c.color)).toEqual(['black', 'cyan', 'yellow'])
    expect(brother!.parts.map(c => c.entity.entity_id)).toEqual(['sensor.mfc_restlebensdauer_der_cyan_trommel', 'sensor.mfc_restlebensdauer_der_fixiereinheit'])
    expect(epson!.supplies.map(c => [c.color, c.level])).toEqual([['black', 73], ['cyan', 12]])
  })

  it('takes the printing state over the device state, and the problems that are on', () => {
    const [brother, epson] = printers(hass)
    expect(brother!.status?.entity_id).toBe('sensor.mfc_druckerstatus')
    expect(epson!.status?.entity_id).toBe('sensor.epson')
    expect(brother!.problems.map(e => e.entity_id)).toEqual(['binary_sensor.mfc_kein_papier'])
  })

  it("counts a cartridge as low at the printer's own level, else at 10 %", () => {
    const [brother, epson] = printers(hass)
    expect(lowSupplies(brother!).map(c => c.entity.entity_id)).toEqual(['sensor.mfc_verbleibender_cyan_toner'])
    expect(lowSupplies(epson!).map(c => c.level)).toEqual([12])
  })

  it('leaves out hidden cartridges and printers outside the dashboard', () => {
    expect(printers(hass, ['kuche'])).toEqual([])
    expect(printers(hass, undefined, [], ['sensor.epson_black_ink', 'sensor.epson_cyan_ink']).map(p => p.deviceId)).toEqual(['brother'])
  })
})

describe('inkColor', () => {
  it('reads the color in English and German', () => {
    expect(inkColor('Schwarz-Toner')).toBe('black')
    expect(inkColor('PGBK ink')).toBe('black')
    expect(inkColor('Light Cyan ink')).toBe('cyan')
    expect(inkColor('gelb toner')).toBe('yellow')
    expect(inkColor('Tri-colour ink')).toBe('other')
  })
})
