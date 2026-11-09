import { describe, expect, it } from 'vitest'
import { CLOSE_AFTER, actionsFor, cameraFor, findDoorbells, fired, lockButtons, resolvePopups, stillOn } from '../src/popups'
import { normalizeConfig } from '../src/config'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'
import type { HassEntity, HomeAssistant } from '../src/types'

const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state: s, attributes })

/** The mock house plus a few entities without a device, each in the given room */
function withLoose(hass: HomeAssistant, loose: [id: string, s: string, area: string, attributes?: Record<string, unknown>][]): HomeAssistant {
  const states = { ...hass.states }
  const entities = { ...hass.entities }
  for (const [id, s, area, attributes] of loose) {
    states[id] = state(id, s, attributes)
    entities[id] = { entity_id: id, area_id: area, labels: [] }
  }
  return { ...hass, states, entities }
}

describe('resolvePopups', () => {
  it('finds the doorbell camera on the trigger\'s device and the lock in its room', () => {
    const [popup] = resolvePopups(createHass(true), [{ trigger: 'binary_sensor.haustur_besucher' }])
    expect(popup).toEqual({
      trigger: 'binary_sensor.haustur_besucher', title: 'Haustür', camera: 'camera.haustur_standardauflosung',
      actions: ['lock.eingangstur'], close_after: CLOSE_AFTER, to: 'on',
    })
  })

  it('keeps what the rule names and leaves out rules without a trigger', () => {
    const popups = resolvePopups(createHass(true), [
      { trigger: 'binary_sensor.haustur_besucher', camera: 'camera.einfahrt', actions: ['script.gute_nacht'], title: ' Klingel ', close_after: 120, to: 'detected' },
      { trigger: '' },
      { trigger: 'binary_sensor.haustur_person', close_after: -5 },
    ])
    expect(popups).toHaveLength(2)
    expect(popups[0]).toMatchObject({ camera: 'camera.einfahrt', actions: ['script.gute_nacht'], title: 'Klingel', close_after: 120, to: 'detected' })
    expect(popups[1]!.close_after).toBe(CLOSE_AFTER)
  })

  it('takes an empty list of actions as "no buttons"', () => {
    expect(resolvePopups(createHass(true), [{ trigger: 'binary_sensor.haustur_besucher', actions: [] }])[0]!.actions).toEqual([])
  })
})

describe('cameraFor and actionsFor', () => {
  it('fall back to the one camera in the trigger\'s room', () => {
    const hass = withLoose(createHass(true), [['binary_sensor.garten_klingel', 'off', 'garten']])
    expect(cameraFor(hass, 'binary_sensor.garten_klingel')).toBe('camera.terrasse')
  })

  it('find no camera where the room has none or several', () => {
    const hass = withLoose(createHass(true), [
      ['binary_sensor.bad_knopf', 'off', 'bad'],
      ['binary_sensor.garten_klingel', 'off', 'garten'],
      ['camera.garten_zwei', 'idle', 'garten'],
    ])
    expect(cameraFor(hass, 'binary_sensor.bad_knopf')).toBeUndefined()
    expect(cameraFor(hass, 'binary_sensor.garten_klingel')).toBeUndefined()
  })

  it('take the only lock in the house when the trigger\'s room has none, and none when there are several', () => {
    const hass = withLoose(createHass(true), [['binary_sensor.garten_klingel', 'off', 'garten']])
    expect(actionsFor(hass, 'binary_sensor.garten_klingel')).toEqual(['lock.eingangstur'])
    const two = withLoose(hass, [['lock.garage', 'locked', 'garage']])
    expect(actionsFor(two, 'binary_sensor.garten_klingel')).toEqual([])
    expect(actionsFor(two, 'binary_sensor.haustur_besucher')).toEqual(['lock.eingangstur'])
  })
})

describe('fired', () => {
  const rule = { trigger: 'binary_sensor.klingel', to: 'on' }
  const off = state('binary_sensor.klingel', 'off')
  const on = state('binary_sensor.klingel', 'on')

  it('fires when the trigger turns on while the page is open', () => {
    expect(fired(rule, off, on)).toBe(true)
    expect(fired(rule, on, { ...on, attributes: { x: 1 } })).toBe(false)
    expect(fired(rule, on, off)).toBe(false)
  })

  it('does not fire for the state the page opened with, nor when the trigger goes away', () => {
    expect(fired(rule, undefined, on)).toBe(false)
    expect(fired(rule, state('binary_sensor.klingel', 'unavailable'), on)).toBe(true)
    expect(fired(rule, off, state('binary_sensor.klingel', 'unavailable'))).toBe(false)
  })

  it('fires on every new event of an event entity', () => {
    const event = { trigger: 'event.klingel', to: 'on' }
    const a = state('event.klingel', '2026-11-09T10:00:00.000+00:00')
    const b = state('event.klingel', '2026-11-09T10:05:00.000+00:00')
    expect(fired(event, a, b)).toBe(true)
    expect(fired(event, a, { ...a, attributes: { event_type: 'ring' } })).toBe(false)
    expect(fired(event, a, state('event.klingel', 'unavailable'))).toBe(false)
  })

  it('keeps the window while the trigger is still on, never for an event', () => {
    expect(stillOn(rule, on)).toBe(true)
    expect(stillOn(rule, off)).toBe(false)
    expect(stillOn({ trigger: 'event.klingel', to: 'on' }, state('event.klingel', 'on'))).toBe(false)
  })
})

describe('lockButtons', () => {
  it('offers to open a lock that can, and unlock or lock by its state', () => {
    expect(lockButtons(state('lock.nuki', 'locked', { supported_features: 1 }))).toEqual(['open', 'unlock'])
    expect(lockButtons(state('lock.nuki', 'unlocked', { supported_features: 1 }))).toEqual(['open', 'lock'])
    expect(lockButtons(state('lock.simple', 'unlocked'))).toEqual(['lock'])
    expect(lockButtons(state('lock.simple', 'jammed'))).toEqual(['lock'])
    expect(lockButtons(state('lock.nuki', 'unavailable', { supported_features: 1 }))).toEqual([])
  })
})

describe('findDoorbells', () => {
  it('finds the visitor sensor of a camera device', () => {
    expect(findDoorbells(createHass(true))).toEqual(['binary_sensor.haustur_besucher'])
  })
})

describe('popups in the config and the dashboard', () => {
  it('reads popups written by hand: a bare trigger, one rule, one action', () => {
    expect(normalizeConfig({ type: 'x', popups: ['binary_sensor.klingel'] as never }).popups).toEqual([{ trigger: 'binary_sensor.klingel' }])
    expect(normalizeConfig({ type: 'x', popups: { trigger: 'binary_sensor.klingel', actions: 'lock.nuki' } as never }).popups)
      .toEqual([{ trigger: 'binary_sensor.klingel', actions: ['lock.nuki'] }])
  })

  it('hands the popups to the nav bar on every page, and none without rules', async () => {
    const navOf = (views: Record<string, any>[]) => views.map(v => (v.sections as { cards: Record<string, any>[] }[])
      .flatMap(s => s.cards).find(c => c.type === 'custom:ad-nav-bar')!)
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard', popups: [{ trigger: 'binary_sensor.haustur_besucher' }] }, createHass(true))
    const navs = navOf(views)
    expect(navs.every(n => n.popups?.[0]?.camera === 'camera.haustur_standardauflosung')).toBe(true)
    const plain = await generateDashboard({ type: 'custom:auto-dashboard' }, createHass(true))
    expect(navOf(plain.views).some(n => 'popups' in n)).toBe(false)
  })
})
