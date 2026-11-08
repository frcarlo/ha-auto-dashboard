import { describe, expect, it } from 'vitest'
import { activitiesFrom } from '../src/activity'
import type { HassEntity } from '../src/types'

const since = Date.UTC(2026, 10, 8)
const at = (min: number) => since / 1000 + min * 60
const entity = (entity_id: string, device_class?: string) =>
  ({ entity_id, state: 'off', attributes: device_class ? { device_class } : {} }) as unknown as HassEntity
const states = Object.fromEntries([
  entity('light.decke'), entity('cover.rollo', 'shutter'), entity('binary_sensor.flur_bewegung', 'motion'),
  entity('binary_sensor.haustur', 'door'), entity('lock.haustur'),
].map(e => [e.entity_id, e]))

describe('activity of the day', () => {
  it('lists every switch of a light, newest first, but not the state the day began with or a dimmed light', () => {
    const found = activitiesFrom({
      'light.decke': [{ s: 'off', lu: at(0) }, { s: 'on', lu: at(60) }, { s: 'on', lu: at(61) }, { s: 'off', lu: at(90) }],
    }, states, since * 1)
    expect(found.map(a => [a.state, a.at])).toEqual([['off', at(90) * 1000], ['on', at(60) * 1000]])
  })

  it('takes where a blind or a lock ended up, not the way there', () => {
    const found = activitiesFrom({
      'cover.rollo': [{ s: 'open', lu: at(0) }, { s: 'closing', lu: at(10) }, { s: 'closed', lu: at(11) }],
      'lock.haustur': [{ s: 'locked', lu: at(0) }, { s: 'unlocking', lu: at(20) }, { s: 'unlocked', lu: at(20.1) }, { s: 'unavailable', lu: at(30) }, { s: 'unlocked', lu: at(31) }],
    }, states, since)
    expect(found.map(a => `${a.entity} ${a.state}`)).toEqual(['lock.haustur unlocked', 'cover.rollo closed'])
  })

  it('counts a door both ways, motion only when it starts and once for someone walking through', () => {
    const found = activitiesFrom({
      'binary_sensor.haustur': [{ s: 'off', lu: at(0) }, { s: 'on', lu: at(100) }, { s: 'off', lu: at(101) }],
      'binary_sensor.flur_bewegung': [{ s: 'off', lu: at(0) }, { s: 'on', lu: at(200) }, { s: 'off', lu: at(200.5) }, { s: 'on', lu: at(201) }, { s: 'off', lu: at(202) }, { s: 'on', lu: at(300) }],
    }, states, since)
    expect(found.map(a => `${a.entity} ${a.state}`)).toEqual([
      'binary_sensor.flur_bewegung on', 'binary_sensor.flur_bewegung on', 'binary_sensor.haustur off', 'binary_sensor.haustur on',
    ])
    expect(found.filter(a => a.entity === 'binary_sensor.flur_bewegung').map(a => a.at)).toEqual([at(300) * 1000, at(200) * 1000])
  })
})
