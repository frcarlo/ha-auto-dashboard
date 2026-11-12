import { describe, expect, it } from 'vitest'
import {
  binColor, birthdayName, birthdays, co2Sensors, currentWarnings, findEventSources, finishedAppliances, stuffyRooms, trackedParcels, wastePickup, warningName,
} from '../src/events'
import { findAppliances } from '../src/appliances'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'
import type { HomeAssistant } from '../src/types'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

function hassWith(states: Record<string, { state: string; attributes?: Record<string, unknown>; area?: string }>): HomeAssistant {
  return {
    states: Object.fromEntries(Object.entries(states).map(([id, s]) => [id, { entity_id: id, state: s.state, attributes: s.attributes ?? {} }])),
    entities: Object.fromEntries(Object.entries(states).map(([id, s]) => [id, { entity_id: id, area_id: s.area ?? null }])),
    devices: {}, areas: { buro: { area_id: 'buro', name: 'Büro Keller' }, kuche: { area_id: 'kuche', name: 'Küche' } },
    themes: { darkMode: true }, language: 'de', callService: async () => undefined,
  }
}

describe('waste', () => {
  const hass = hassWith({
    'sensor.gelb': { state: 'on Tue', attributes: { '2026-11-10': 'Gelbe Tonne', '2026-11-24': 'Gelbe Tonne' } },
    'sensor.rest': { state: 'on Mon', attributes: { '2026-11-16': 'Restmüll' } },
    'sensor.bio': { state: 'on Mon', attributes: { '2026-11-16': 'Biotonne' } },
    'sensor.papier': { state: '3', attributes: { friendly_name: 'Waste Collection Schedule Altpapier', daysTo: 1 } },
  })
  // daysTo counts from the real today, so the dated tests leave it out
  const ids = ['sensor.gelb', 'sensor.rest', 'sensor.bio']

  it('shows from 15:00 the day before until 9:00 on the day', () => {
    expect(wastePickup(hass, ids, at(9, 14, 59))).toBeUndefined()
    expect(wastePickup(hass, ids, at(9, 15))?.bins.map(b => b.name)).toEqual(['Gelbe Tonne'])
    expect(wastePickup(hass, ids, at(9, 22))?.day).toBe('tomorrow')
    expect(wastePickup(hass, ids, at(10, 7))).toMatchObject({ day: 'today', bins: [{ name: 'Gelbe Tonne', entity: 'sensor.gelb' }] })
    expect(wastePickup(hass, ids, at(10, 9))).toBeUndefined()
  })

  it('puts every bin of the day on one chip', () => {
    expect(wastePickup(hass, ids, at(15, 18))?.bins.map(b => b.name)).toEqual(['Restmüll', 'Biotonne'])
  })

  it('reads daysTo when there are no dates', () => {
    const now = new Date()
    now.setHours(18, 0, 0, 0)
    expect(wastePickup(hass, ['sensor.papier'], now.getTime())?.bins).toEqual([{ name: 'Altpapier', entity: 'sensor.papier' }])
  })

  it('colours bins as households know them', () => {
    expect(binColor('Gelbe Tonne')).toBe('#facc15')
    expect(binColor('Biotonne')).toBe('#a16207')
    expect(binColor('Altpapier')).toBe('#3b82f6')
    expect(binColor('Restmüll')).toBe('#9ca3af')
    expect(binColor('Sperrmüll')).toBeUndefined()
  })
})

describe('birthdays', () => {
  it('finds the name in the usual titles', () => {
    expect(birthdayName('Geburtstag Margit')).toBe('Margit')
    expect(birthdayName("Margit's birthday")).toBe('Margit')
    expect(birthdayName('Geburtstag von Tom Berger')).toBe('Tom Berger')
    expect(birthdayName('Margit Mustermann – Geburtstag')).toBe('Margit Mustermann')
    expect(birthdayName('🎂 Oma')).toBe('Oma')
    expect(birthdayName('Zahnarzt')).toBeUndefined()
    expect(birthdayName('Geburtstag')).toBeUndefined()
  })

  it('names each one once across calendars', () => {
    expect(birthdays([
      { calendar: 'calendar.a', title: 'Geburtstag Margit' }, { calendar: 'calendar.b', title: 'Geburtstag Margit' },
      { calendar: 'calendar.a', title: 'Elternabend' }, { calendar: 'calendar.b', title: 'Toms Geburtstag' },
    ])).toEqual(['Margit', 'Toms'])
  })
})

describe('warnings', () => {
  const hass = hassWith({
    'sensor.dwd': {
      state: '2', attributes: {
        region_name: 'Mülheim', warning_count: 2,
        warning_1_name: 'FROST', warning_1_headline: 'Amtliche WARNUNG vor FROST', warning_1_level: 1, warning_1_end: new Date(at(10, 8)).toISOString(),
        warning_2_name: 'STURMBÖEN', warning_2_headline: 'Amtliche UNWETTERWARNUNG vor STURMBÖEN', warning_2_level: 3, warning_2_end: new Date(at(10, 20)).toISOString(),
      },
    },
  })

  it('drops the ones that ended and puts the severe first', () => {
    expect(currentWarnings(hass, ['sensor.dwd'], at(10, 7)).map(w => w.name)).toEqual(['STURMBÖEN', 'FROST'])
    expect(currentWarnings(hass, ['sensor.dwd'], at(10, 9)).map(w => w.name)).toEqual(['STURMBÖEN'])
  })

  it('makes a short name', () => {
    expect(warningName({ headline: 'Amtliche WARNUNG vor FROST', name: 'FROST' })).toBe('Frost')
    expect(warningName({ headline: 'Amtliche WARNUNG vor STARKEM GEWITTER' })).toBe('Starkem Gewitter')
    expect(warningName({ headline: 'Hochwasser an der Ruhr' })).toBe('Hochwasser an der Ruhr')
  })
})

describe('co2', () => {
  const hass = hassWith({
    'sensor.buro_co2': { state: '1350', attributes: { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }, area: 'buro' },
    'sensor.kuche_co2': { state: '700', attributes: { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }, area: 'kuche' },
    'sensor.grid_co2': { state: '580', attributes: { device_class: 'carbon_dioxide', unit_of_measurement: 'gCO2eq/kWh' } },
  })

  it('takes room sensors in ppm only', () => {
    expect(co2Sensors(hass, Object.keys(hass.states))).toEqual(['sensor.buro_co2', 'sensor.kuche_co2'])
  })

  it('lists rooms at or over the limit', () => {
    expect(stuffyRooms(hass, ['sensor.buro_co2', 'sensor.kuche_co2'])).toEqual([{ entity: 'sensor.buro_co2', value: 1350, area: 'Büro Keller' }])
    expect(stuffyRooms(hass, ['sensor.buro_co2', 'sensor.kuche_co2'], 700).map(r => r.area)).toEqual(['Büro Keller', 'Küche'])
  })
})

describe('sources', () => {
  it('finds bins, warnings, parcel and other calendars in the harness house', () => {
    const hass = createHass(true)
    const sources = findEventSources(hass, { appliances: findAppliances(hass) })!
    expect(sources.waste).toEqual(['sensor.waste_collection_schedule_gelbe_tonne', 'sensor.waste_collection_schedule_restmull', 'sensor.waste_collection_schedule_biotonne'])
    // The current DWD level, not the advance one; NINA's slots
    expect(sources.warnings).toEqual(expect.arrayContaining(['sensor.dwd_aktuelle_warnstufe', 'binary_sensor.warning_mulheim_1']))
    expect(sources.warnings).not.toContain('sensor.dwd_vorwarnstufe')
    // Parcel Aggregator's calendar is left to its sensors
    expect(sources.parcels).toEqual(['calendar.dhl_zustellungen'])
    expect(sources.parcel_sensors).toEqual(['sensor.parcel_aggregator_incoming_parcels', 'sensor.parcel_aggregator_awaiting_pickup', 'sensor.ups_incoming_parcels'])
    expect(sources.birthdays).toContain('calendar.familie')
    expect(sources.birthdays).not.toContain('calendar.dhl_zustellungen')
    expect(finishedAppliances(hass, sources.appliances).map(a => a.name)).toEqual(['Waschmaschine'])
  })

  it('leaves out hidden chips and takes the configured warnings', () => {
    const hass = createHass(true)
    const sources = findEventSources(hass, { hidden: ['waste', 'birthday'], warnings: ['binary_sensor.warning_mulheim_2'] })!
    expect(sources.waste).toBeUndefined()
    expect(sources.birthdays).toBeUndefined()
    expect(sources.warnings).toEqual(['binary_sensor.warning_mulheim_2'])
  })
})

describe('parcels', () => {
  it('lists each parcel once, the most pressing first, without delivered or sent ones', () => {
    const hass = createHass(true)
    const ids = findEventSources(hass)!.parcel_sensors
    const parcels = trackedParcels(hass, ids, Date.now())
    expect(parcels.map(p => [p.stage, p.carrier, p.sender])).toEqual([['today', 'DHL', 'Thalia'], ['pickup', 'Hermes', 'Zalando'], ['transit', 'UPS', undefined]])
    expect(new Date(parcels[0]!.from!).getHours()).toBe(10)
  })

  it('counts a parcel planned for today as due, and one planned later as on its way', () => {
    const hass = createHass(true)
    const today = new Date()
    today.setHours(15, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    hass.states['sensor.parcel_aggregator_incoming_parcels']!.attributes.parcels = [
      { carrier: 'GLS', barcode: 'a', status: 'in_transit', planned_from: today.toISOString() },
      { carrier: 'DPD', barcode: 'b', status: 'in_transit', planned_from: tomorrow.toISOString() },
    ]
    expect(trackedParcels(hass, ['sensor.parcel_aggregator_incoming_parcels'], today.getTime()).map(p => p.stage)).toEqual(['today', 'transit'])
  })
})

describe('strategy', () => {
  const statusBars = (views: any[]) => views.flatMap(v => (v.sections ?? []).flatMap((s: any) => s.cards ?? [])).filter((c: any) => c.type === 'custom:ad-status-bar')

  it('gives Home the sources and a room its CO₂ sensor', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', co2_limit: 1000 }, createHass(true))
    const home = statusBars(views.filter(v => v.path === 'home'))[0]
    expect(home.events.waste).toHaveLength(3)
    expect(home.events.co2).toEqual(['sensor.wohnzimmer_co2'])
    expect(home.events.co2_limit).toBe(1000)
    const room = statusBars(views.filter(v => v.path === 'area-wohnzimmer'))[0]
    expect(room.events).toEqual({ co2: ['sensor.wohnzimmer_co2'], co2_limit: 1000 })
  })

  it('drops what is hidden for everyone', async () => {
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', hide_chips: ['waste', 'co2'] }, createHass(true))
    const home = statusBars(views.filter(v => v.path === 'home'))[0]
    expect(home.events.waste).toBeUndefined()
    expect(home.events.co2).toBeUndefined()
    expect(statusBars(views.filter(v => v.path === 'area-wohnzimmer'))[0].events).toBeUndefined()
  })
})
