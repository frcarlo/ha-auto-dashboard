import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSceneTints, hsToRgb, kelvinToRgb, loadSceneTints, onTint, sceneTint, tintOf } from '../src/scene-colors'
import type { HomeAssistant } from '../src/types'

describe('scene colours', () => {
  afterEach(() => clearSceneTints())

  it('turns colour temperatures and hue into the colour a bulb shows', () => {
    const warm = kelvinToRgb(2700)
    expect(warm[0]).toBe(255)
    expect(warm[2]).toBeLessThan(warm[1])
    expect(kelvinToRgb(6500)[2]).toBeGreaterThan(240)
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0])
    expect(hsToRgb(240, 100)).toEqual([0, 0, 255])
    expect(hsToRgb(0, 0)).toEqual([255, 255, 255])
  })

  it('mixes the colours of the lights a scene switches on, brighter ones counting more', () => {
    expect(sceneTint({ 'light.a': { state: 'on', rgb_color: [255, 0, 0], brightness: 255 }, 'light.b': { state: 'on', rgb_color: [0, 0, 255], brightness: 85 } }))
      .toEqual([191, 0, 64])
    expect(sceneTint({ 'light.a': { state: 'off' }, 'light.b': { state: 'off' } })).toBe('off')
    // No light, or lights without a colour: no tint
    expect(sceneTint({ 'cover.rollo': { state: 'open' } })).toBeUndefined()
    expect(sceneTint({ 'light.a': { state: 'on', brightness: 200 } })).toBeUndefined()
    expect(onTint([255, 220, 150])).toBe('#000')
    expect(onTint([40, 40, 160])).toBe('#fff')
  })

  it('reads the scenes once, for admins only', async () => {
    const callApi = vi.fn(async () => ({ entities: { 'light.kino': { state: 'on', color_temp_kelvin: 2200 } } }))
    const hass = { user: { is_admin: true }, callApi, states: { 'scene.kino': { entity_id: 'scene.kino', state: '', attributes: { id: '17' } } } } as unknown as HomeAssistant
    expect(await loadSceneTints(hass, ['scene.kino', 'script.x'])).toBe(true)
    expect(callApi).toHaveBeenCalledWith('GET', 'config/scene/config/17')
    expect(tintOf('scene.kino')).toEqual(kelvinToRgb(2200))
    expect(await loadSceneTints(hass, ['scene.kino'])).toBe(false)
    expect(callApi).toHaveBeenCalledTimes(1)
    clearSceneTints()
    expect(await loadSceneTints({ ...hass, user: { is_admin: false } } as HomeAssistant, ['scene.kino'])).toBe(false)
  })
})
