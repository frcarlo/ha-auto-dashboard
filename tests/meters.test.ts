import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearUsage, formatVolume, loadUsage, meterSources, usageOf } from '../src/meters'
import type { HomeAssistant } from '../src/types'

const hass = (ids: string[], callWS?: unknown) => ({ states: Object.fromEntries(ids.map(id => [id, { entity_id: id, state: '1', attributes: {} }])), callWS }) as unknown as HomeAssistant

describe('meters', () => {
  afterEach(() => clearUsage())

  it('takes gas and water from the energy settings, only meters that exist', () => {
    const prefs = { energy_sources: [
      { type: 'grid', stat_rate: 'sensor.netz' },
      { type: 'gas', stat_energy_from: 'sensor.gas', stat_rate: 'sensor.gas_flow', number_energy_price: 0.9 },
      { type: 'water', stat_energy_from: 'sensor.gone', stat_rate: null },
    ] }
    expect(meterSources(hass(['sensor.gas', 'sensor.gas_flow']), prefs)).toEqual([{ kind: 'gas', meters: ['sensor.gas'], rates: ['sensor.gas_flow'], price: 0.9 }])
  })

  it('sums today from midnight, keeps the last day per hour and the month', async () => {
    const now = new Date(2026, 10, 12, 10, 30).getTime()
    const midnight = new Date(2026, 10, 12).getTime()
    const callWS = vi.fn(async (msg: { period: string }) => msg.period === 'month'
      ? { 'sensor.gas': [{ start: midnight, change: 40 }] }
      : { 'sensor.gas': [{ start: midnight - 2 * 3600_000, change: 1 }, { start: midnight + 3600_000, change: 0.5 }, { start: midnight + 9 * 3600_000, change: 0.25 }] })
    await loadUsage(hass(['sensor.gas'], callWS), ['sensor.gas'], now)
    expect(callWS).toHaveBeenCalledTimes(2)
    expect(usageOf(['sensor.gas'])).toEqual({ today: 0.75, month: 40, hours: [[midnight - 2 * 3600_000, 1], [midnight + 3600_000, 0.5], [midnight + 9 * 3600_000, 0.25]] })
  })

  it('shows a day of water in litres, gas in m³', () => {
    expect(formatVolume(0.227, 'm³', 'water', 'de')).toEqual({ value: '227', unit: 'L' })
    expect(formatVolume(1.234, 'm³', 'gas', 'de')).toEqual({ value: '1,23', unit: 'm³' })
    expect(formatVolume(3.84, 'm³', 'water', 'de')).toEqual({ value: '3,84', unit: 'm³' })
  })
})
