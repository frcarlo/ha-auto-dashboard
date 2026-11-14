import { describe, expect, it } from 'vitest'
import { isVtherm, vthermOf } from '../src/vtherm'
import type { HassEntity, HomeAssistant } from '../src/types'

const climate = (id: string, attributes: Record<string, any>): HassEntity => ({ entity_id: id, state: 'heat', attributes })

const vtAttrs = {
  preset_modes: ['none', 'frost', 'eco', 'comfort', 'boost'], preset_mode: 'comfort', ema_temp: 19.4,
  preset_temperatures: { frost_temp: 7, eco_temp: 22, comfort_temp: 21, boost_temp: 24 },
  is_over_climate: true, regulated_target_temperature: 23, is_window_configured: true,
  window_manager: { window_state: 'off', window_auto_state: 'unavailable' }, safety_manager: { safety_state: 'off' },
  specific_states: { temperature_slope: 0.39 },
}

const hassWith = (entities: HomeAssistant['entities']) => ({ entities, states: {} }) as unknown as HomeAssistant

describe('Versatile Thermostat', () => {
  const vt = climate('climate.vthermostat_schlafzimmer', vtAttrs)
  const hass = hassWith({
    'climate.vthermostat_schlafzimmer': { entity_id: 'climate.vthermostat_schlafzimmer', device_id: 'd1', platform: 'versatile_thermostat' },
    'switch.vthermostat_schlafzimmer_follow_underlying_temp_change': { entity_id: 'switch.vthermostat_schlafzimmer_follow_underlying_temp_change', device_id: 'd1', platform: 'versatile_thermostat' },
    'switch.other_follow_underlying_temp_change': { entity_id: 'switch.other_follow_underlying_temp_change', device_id: 'd2', platform: 'versatile_thermostat' },
  })

  it('is told apart from the thermostat beneath it by its integration', () => {
    const trv = climate('climate.thermostat_schlafzimmer', { current_temperature: 19.5, temperature: 23 })
    const reg = hassWith({ 'climate.thermostat_schlafzimmer': { entity_id: 'climate.thermostat_schlafzimmer', platform: 'mqtt' } })
    expect(isVtherm(hass, vt)).toBe(true)
    expect(isVtherm(reg, trv)).toBe(false)
    expect(vthermOf(reg, trv)).toBeUndefined()
  })

  it('is still found by its attributes when the registry has no platform', () => {
    expect(isVtherm(hassWith({}), vt)).toBe(true)
  })

  it('reads presets, regulation, trend, window and the follow switch of its own device', () => {
    expect(vthermOf(hass, vt)).toEqual({
      device: 'd1',
      presets: [{ mode: 'frost', temp: 7 }, { mode: 'eco', temp: 22 }, { mode: 'comfort', temp: 21 }, { mode: 'boost', temp: 24 }],
      preset: 'comfort',
      regulated: 23,
      slope: 0.39,
      window: 'closed',
      safety: false,
      follow: 'switch.vthermostat_schlafzimmer_follow_underlying_temp_change',
    })
  })

  it('reports an open window, the automatic detection too, and the safety mode', () => {
    const open = climate('climate.a', { ...vtAttrs, window_manager: { window_state: 'on' } })
    const auto = climate('climate.b', { ...vtAttrs, is_window_configured: false, is_window_auto_configured: true, window_manager: { window_state: 'off', window_auto_state: 'on' } })
    const safe = climate('climate.c', { ...vtAttrs, safety_manager: { safety_state: 'on' } })
    expect(vthermOf(hass, open)?.window).toBe('open')
    expect(vthermOf(hass, auto)?.window).toBe('open')
    expect(vthermOf(hass, safe)?.safety).toBe(true)
  })

  it('leaves out what is not set up: no window sensor, no regulation, no preset', () => {
    const plain = climate('climate.d', { ...vtAttrs, is_window_configured: false, is_over_climate: false, preset_mode: 'none' })
    const info = vthermOf(hass, plain)!
    expect(info.window).toBeUndefined()
    expect(info.regulated).toBeUndefined()
    expect(info.preset).toBeUndefined()
  })
})
