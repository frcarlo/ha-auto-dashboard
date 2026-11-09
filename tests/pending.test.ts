import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GIVE_UP, SHOW_AFTER, expected, hasFailed, isWaiting, resetPending, settle, track } from '../src/pending'
import type { HassEntity, HomeAssistant } from '../src/types'

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes })
const hassOf = (...entities: HassEntity[]) => ({ states: Object.fromEntries(entities.map(e => [e.entity_id, e])) }) as unknown as HomeAssistant

describe('waiting for a switch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    resetPending()
    vi.useRealTimers()
  })

  it('expects only what the call can change', () => {
    const hass = hassOf(st('light.a', 'on'), st('light.b', 'off'), st('light.c', 'unavailable'), st('cover.d', 'open'))
    expect(expected(hass, 'homeassistant', 'turn_off', ['light.a', 'light.b', 'light.c'])).toEqual({ ids: ['light.a'], flip: true })
    expect(expected(hass, 'light', 'turn_on', ['light.a', 'light.b'])).toEqual({ ids: ['light.b'], flip: true })
    // Dimming changes the brightness, not the state
    expect(expected(hass, 'light', 'turn_on', ['light.a'], { brightness_pct: 40 })).toEqual({ ids: ['light.a'], flip: false })
    expect(expected(hass, 'cover', 'open_cover', ['cover.d']).ids).toEqual([])
    expect(expected(hass, 'cover', 'stop_cover', ['cover.d']).ids).toEqual([])
  })

  it('shows only after a moment and ends when the new state arrives', () => {
    const off = st('switch.kaffee', 'off')
    track(hassOf(off), 'switch', 'toggle', ['switch.kaffee'], {})
    expect(isWaiting('switch.kaffee')).toBe(false)
    vi.advanceTimersByTime(SHOW_AFTER)
    expect(isWaiting('switch.kaffee')).toBe(true)
    // A new attribute alone is not the switch
    settle(hassOf(st('switch.kaffee', 'off', { x: 1 })))
    expect(isWaiting('switch.kaffee')).toBe(true)
    settle(hassOf(st('switch.kaffee', 'on')))
    expect(isWaiting('switch.kaffee')).toBe(false)
    expect(hasFailed('switch.kaffee')).toBe(false)
  })

  it('says so when no answer comes', () => {
    track(hassOf(st('light.a', 'off')), 'light', 'toggle', ['light.a'], {})
    vi.advanceTimersByTime(GIVE_UP)
    expect(isWaiting('light.a')).toBe(false)
    expect(hasFailed('light.a')).toBe(true)
  })

  it('gives up quietly on a dimming that changed nothing', () => {
    track(hassOf(st('light.a', 'on')), 'light', 'turn_on', ['light.a'], { brightness_pct: 100 })
    vi.advanceTimersByTime(GIVE_UP)
    expect(isWaiting('light.a')).toBe(false)
    expect(hasFailed('light.a')).toBe(false)
  })

  it('marks a refused call right away', async () => {
    track(hassOf(st('light.a', 'off')), 'light', 'turn_on', ['light.a'], {}, Promise.reject(new Error('no')))
    await vi.advanceTimersByTimeAsync(0)
    expect(hasFailed('light.a')).toBe(true)
  })
})
