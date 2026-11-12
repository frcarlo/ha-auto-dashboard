import { describe, expect, it } from 'vitest'
import { batteryLevel, isCharging, personPhones, phoneKind, phonePlace, readingOf } from '../src/phones'
import { createHass } from '../dev/mock'

describe('phones', () => {
  const hass = createHass(true)
  const frank = personPhones(hass, hass.states['person.frank'])

  it("finds a person's Companion app devices in the person's order, and what each is", () => {
    expect(frank.map(p => [p.name, p.kind])).toEqual([['Pixel 8', 'phone'], ['iPhone 15', 'phone'], ['Pixel Watch 4', 'watch']])
    expect(personPhones(hass, hass.states['person.nobody'])).toEqual([])
    expect(phoneKind('Tablet Leni', '23073RPBFG')).toBe('tablet')
    expect(phoneKind('SM-X200')).toBe('tablet')
  })

  it('reads Android and iOS sensors alike, and only the app\'s own', () => {
    const [pixel, iphone, watch] = frank
    expect(pixel!.readings).toMatchObject({ battery: 'sensor.pixel_8_battery_level', wifi: 'sensor.pixel_8_wifi_connection', steps: 'sensor.pixel_8_daily_steps' })
    // iOS: the battery sensor with HA's _2, the SSID not the BSSID, Health's steps before the pedometer's
    expect(iphone!.readings).toMatchObject({ battery: 'sensor.iphone_15_battery_level_2', wifi: 'sensor.iphone_15_ssid', steps: 'sensor.iphone_15_health_steps', network: 'sensor.iphone_15_connection_type' })
    expect(watch!.entities).not.toContain('sensor.pixel_watch_4_battery_plus')
    expect(batteryLevel(hass, iphone!)).toBe(41)
  })

  it('knows charging from is_charging or the battery state', () => {
    const [pixel, iphone, watch] = frank
    expect([pixel, iphone, watch].map(p => isCharging(hass, p!))).toEqual([true, false, false])
  })

  it('says where it is: home, or the address while away; nothing while the tracker does not know', () => {
    const [pixel, iphone, watch] = frank
    expect(phonePlace(hass, pixel!)).toEqual({ zone: 'home' })
    expect(phonePlace(hass, iphone!)).toEqual({ zone: 'away', text: 'Schloßstraße 1, Mülheim an der Ruhr' })
    expect(phonePlace(hass, watch!)).toBeUndefined()
    expect(readingOf(hass, watch!, 'location')).toBeUndefined()
  })
})
