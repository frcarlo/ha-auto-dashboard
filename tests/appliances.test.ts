import { describe, expect, it } from 'vitest'
import { applianceEntities, appliancePhase, applianceProgress, applianceTimes, findAppliances, findTvs, kindOf, programLabel } from '../src/appliances'
import { createHass } from '../dev/mock'

describe('appliances', () => {
  it('finds appliances from their operation state and picks each role from the device', () => {
    const hass = createHass(true)
    const [dishwasher, washer] = findAppliances(hass)
    expect(dishwasher).toEqual({
      kind: 'dishwasher', name: 'Geschirrspüler', area: 'kuche',
      status: 'sensor.geschirrspuler_betriebszustand',
      progress: 'sensor.geschirrspuler_programm_fortschritt',
      end: 'sensor.geschirrspuler_programm_endzeit',
      // The running program, not the one picked for the next start
      program: 'select.geschirrspuler_aktives_programm',
      door: 'sensor.geschirrspuler_tur',
      notices: ['sensor.geschirrspuler_salz_fast_leer', 'sensor.geschirrspuler_klarspuler_fast_leer'],
    })
    expect(washer).toMatchObject({ kind: 'washer', area: 'waschkeller', remaining: 'sensor.waschmaschine_verbleibende_zeit', power: 'sensor.waschmaschine_leistung' })
  })

  it('adds appliances set up by hand, and one with a found status replaces it', () => {
    const hass = createHass(true)
    const list = findAppliances(hass, [
      { status: 'sensor.trockner_leistung', name: 'Trockner' },
      { status: 'sensor.waschmaschine_zustand', name: 'Maschine' },
    ])
    expect(list.map(a => [a.name, a.kind, a.area])).toEqual([['Geschirrspüler', 'dishwasher', 'kuche'], ['Maschine', 'washer', 'waschkeller'], ['Trockner', 'dryer', 'waschkeller']])
    expect(findAppliances(hass, [], { domains: ['appliance'] })).toEqual([])
    expect(findAppliances(hass, [], {}, ['kuche']).map(a => a.name)).toEqual(['Geschirrspüler'])
  })

  it('reads the phase from a state, a power reading or a switch', () => {
    const hass = createHass(true)
    const [dishwasher, washer] = findAppliances(hass)
    expect(appliancePhase(hass, dishwasher!)).toBe('running')
    expect(appliancePhase(hass, washer!)).toBe('finished')
    expect(appliancePhase(hass, { kind: 'dryer', name: 'Trockner', status: 'sensor.trockner_leistung' })).toBe('running')
    hass.states['sensor.trockner_leistung']!.state = '1.2'
    expect(appliancePhase(hass, { kind: 'dryer', name: 'Trockner', status: 'sensor.trockner_leistung' })).toBe('ready')
    // Still "running", but the program is through and the power is gone
    hass.states['sensor.waschmaschine_zustand']!.state = 'running'
    expect(appliancePhase(hass, washer!)).toBe('finished')
    hass.states['sensor.geschirrspuler_betriebszustand']!.state = 'unavailable'
    expect(appliancePhase(hass, dishwasher!)).toBe('unavailable')
  })

  it('knows the end from an end time or the time left, and reckons the start back from the progress', () => {
    const hass = createHass(true)
    const now = Date.parse('2026-11-06T12:00:00Z')
    const a = { kind: 'washer' as const, name: 'W', status: 'sensor.waschmaschine_zustand', remaining: 'sensor.waschmaschine_verbleibende_zeit' }
    hass.states['sensor.waschmaschine_verbleibende_zeit']!.state = '30'
    expect(applianceTimes(hass, a, now, 75)).toEqual({ end: now + 30 * 60_000, start: now - 90 * 60_000 })
    hass.states['sensor.waschmaschine_verbleibende_zeit']!.state = '1:15:00'
    expect(applianceTimes(hass, a, now).end).toBe(now + 75 * 60_000)
    expect(applianceProgress(hass, findAppliances(hass)[0]!, 'running')).toBe(62)
    expect(applianceProgress(hass, findAppliances(hass)[0]!, 'ready')).toBeUndefined()
  })

  it('names programs and kinds the way people read them', () => {
    const hass = createHass(true)
    expect(programLabel(hass, 'select.geschirrspuler_aktives_programm')).toBe('Eco 50')
    expect(programLabel(hass, 'sensor.waschmaschine_programm')).toBe('Baumwolle Long')
    expect(kindOf('trockner keller')).toBe('dryer')
    expect(kindOf('washing machine')).toBe('washer')
  })

  it('takes a found appliance\'s read-outs off the room page, but keeps its switches', () => {
    const hass = createHass(true)
    const ids = applianceEntities(hass, findAppliances(hass)[0]!)
    expect(ids).toContain('select.geschirrspuler_ausgewahltes_programm')
    expect(ids).not.toContain('switch.geschirrspuler_intensivzone')
  })

  it('shows one TV per set, with the Android TV Remote pair over the ADB one', () => {
    expect(findTvs(createHass(true))).toEqual([{
      name: 'TV-Wohnzimmer', area: 'wohnzimmer', entity: 'media_player.tv_wohnzimmer', remote: 'remote.tv_wohnzimmer', keys: 'androidtv_remote',
      others: ['media_player.tv_wohnzimmer_adb', 'remote.tv_wohnzimmer_adb'],
    }])
  })
})
