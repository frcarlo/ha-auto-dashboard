import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSparks, hasSpark, loadSpark, sparkPath, sparkPoints } from '../src/sparkline'
import type { HassEntity, HomeAssistant } from '../src/types'

const sensor = (id: string, state: string, state_class?: string): HassEntity => ({ entity_id: id, state, attributes: state_class ? { state_class } : {} })

describe('sparkline', () => {
  afterEach(() => { clearSparks(); vi.useRealTimers() })

  it('draws only measurements with a number', () => {
    expect(hasSpark(sensor('sensor.t', '21.3', 'measurement'))).toBe(true)
    expect(hasSpark(sensor('sensor.e', '91', 'total_increasing'))).toBe(false)
    expect(hasSpark(sensor('sensor.s', '10.6'))).toBe(false)
    expect(hasSpark(sensor('sensor.t', 'unavailable', 'measurement'))).toBe(false)
  })

  it('puts the lowest value at the bottom, the highest at the top, a flat line through the middle', () => {
    const { line, area } = sparkPath([[0, 10], [50, 20], [100, 15]])!
    expect(line).toBe('M0.00,30.00L50.00,2.00L100.00,16.00')
    expect(area.endsWith('L100,32L0,32Z')).toBe(true)
    expect(sparkPath([[0, 5], [10, 5]])!.line).toBe('M0.00,16.00L100.00,16.00')
    expect(sparkPath([[0, 5]])).toBeUndefined()
  })

  it('asks for all tiles in one call and adds the current value at the end', async () => {
    vi.useFakeTimers()
    const callWS = vi.fn(async (msg: { statistic_ids: string[] }) =>
      Object.fromEntries(msg.statistic_ids.map(id => [id, [{ start: 1000, mean: 20 }, { start: 2000, mean: 22 }]])))
    const hass = { callWS } as unknown as HomeAssistant
    const done = Promise.all([loadSpark(hass, 'sensor.a'), loadSpark(hass, 'sensor.b'), loadSpark(hass, 'sensor.a')])
    await vi.runAllTimersAsync()
    await done
    expect(callWS).toHaveBeenCalledTimes(1)
    expect(callWS.mock.calls[0]![0]).toMatchObject({ type: 'recorder/statistics_during_period', statistic_ids: ['sensor.a', 'sensor.b'], period: 'hour', types: ['mean'] })
    expect(sparkPoints(sensor('sensor.a', '23', 'measurement'), 3000)).toEqual([[1000, 20], [2000, 22], [3000, 23]])
    // Fresh: no second call
    await loadSpark(hass, 'sensor.a')
    expect(callWS).toHaveBeenCalledTimes(1)
  })
})
