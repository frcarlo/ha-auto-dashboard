import { describe, expect, it } from 'vitest'
import { activeWarnings, compass, forecastDays, temperatureColor, weatherEntity } from '../src/weather'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'
import type { HassEntity } from '../src/types'

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes })

describe('weather', () => {
  it('takes the configured entity, else the first one with a daily forecast; hide_domains hides it', () => {
    const hass = createHass(true)
    hass.states['weather.hourly'] = st('weather.hourly', 'sunny', { supported_features: 2 })
    expect(weatherEntity(hass, {})).toBe('weather.home')
    expect(weatherEntity(hass, { weather_entity: 'weather.hourly' })).toBe('weather.hourly')
    expect(weatherEntity(hass, { weather_entity: 'weather.gone' })).toBeUndefined()
    expect(weatherEntity(hass, { hide_domains: ['weather'] })).toBeUndefined()
  })

  it('sums a forecast up per day: high, low, daytime condition, highest chance of rain', () => {
    const at = (h: number, day = 6) => new Date(2026, 10, day, h).toISOString()
    const days = forecastDays([
      { datetime: at(0), condition: 'clear-night', temperature: 3, templow: 1, is_daytime: false },
      { datetime: at(12), condition: 'rainy', temperature: 9, precipitation_probability: 70, is_daytime: true },
      { datetime: at(12, 7), condition: 'sunny', temperature: 12, templow: 2 },
    ])
    expect(days).toEqual([
      { date: '2026-11-06', condition: 'rainy', high: 9, low: 1, precipitation_probability: 70 },
      { date: '2026-11-07', condition: 'sunny', high: 12, low: 2 },
    ])
  })

  it('reads NINA and DWD warnings and ignores quiet ones', () => {
    const hass = createHass(true)
    hass.states['binary_sensor.nina_1'] = st('binary_sensor.nina_1', 'on', { headline: 'Sturmböen', severity: 'Severe', expires: '2026-11-06T18:00:00+01:00' })
    hass.states['binary_sensor.nina_2'] = st('binary_sensor.nina_2', 'off', { headline: 'alt' })
    hass.states['sensor.dwd'] = st('sensor.dwd', '1', { warning_count: 1, warning_1_name: 'Frost', warning_1_headline: 'Amtliche WARNUNG vor FROST', warning_1_level: 1 })
    expect(activeWarnings(hass, ['binary_sensor.nina_1', 'binary_sensor.nina_2', 'sensor.dwd', 'sensor.missing'])).toEqual([
      { entity_id: 'binary_sensor.nina_1', headline: 'Sturmböen', severity: 'error', until: '2026-11-06T18:00:00+01:00' },
      { entity_id: 'sensor.dwd', headline: 'Amtliche WARNUNG vor FROST', severity: 'warning', until: undefined },
    ])
  })

  it('names wind directions and colors temperatures from cold to hot', () => {
    const points = 'N,NO,O,SO,S,SW,W,NW'.split(',')
    expect(compass(100, points)).toBe('O')
    expect(compass(350, points)).toBe('N')
    expect(compass('NE', points)).toBe('NE')
    expect(compass(undefined, points)).toBeUndefined()
    expect(temperatureColor(-20)).toBe('rgb(96, 165, 250)')
    expect(temperatureColor(40)).toBe('rgb(239, 68, 68)')
    expect(temperatureColor(68, '°F')).toBe(temperatureColor(20))
  })

  it('puts the weather card on Home instead of the outside tile; inside stays', async () => {
    const cards = (view: Record<string, unknown>) => (view.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).flatMap(c => c.type === 'custom:ad-row' ? c.cards : [c])
    const { views } = await generateDashboard({
      type: 'custom:auto-dashboard', outdoor_areas: ['garten'], weather_warnings: ['binary_sensor.warning_mulheim_1'], forecast_days: 5,
      weather_sensors: { temperature: 'sensor.aussen_temperatur', humidity: 'sensor.gibt_es_nicht' },
    }, createHass(true))
    const home = cards(views[0]!)
    const card = home.find(c => c.type === 'custom:ad-weather')!
    expect(card).toMatchObject({ entity: 'weather.home', warnings: ['binary_sensor.warning_mulheim_1'], days: 5 })
    // Only sensors that exist; outdoor areas no longer guess the temperature
    expect(card.sensors).toEqual({ temperature: 'sensor.aussen_temperatur' })
    expect(card.outdoor).toBeUndefined()
    const info = home.find(c => c.type === 'custom:ad-house-info')!
    expect(info.outdoor).toBeUndefined()
    expect(info.areas).toContain('wohnzimmer')
    expect(info.areas).not.toContain('garten')
    expect(home.find(c => c.type === 'custom:ad-header')!.weather).toBe(false)

    const without = cards((await generateDashboard({ type: 'custom:auto-dashboard', hide_domains: ['weather'], outdoor_areas: ['garten'] }, createHass(true))).views[0]!)
    expect(without.some(c => c.type === 'custom:ad-weather')).toBe(false)
    expect(without.find(c => c.type === 'custom:ad-house-info')!.outdoor).toEqual(['garten'])
  })
})
