import { describe, expect, it, vi } from 'vitest'
import { blocksOf, checkBlocks, dayOf, formatTime, loadSchedules, parseTime, shortTime, updateMessage, withBlocks, type ScheduleItem } from '../src/schedules'
import type { HomeAssistant } from '../src/types'

const plan: ScheduleItem = {
  id: 'heizplan_bader', name: 'Heizplan Bäder', icon: 'mdi:shower',
  monday: [{ from: '19:00:00', to: '21:30:00' }, { from: '05:30:00', to: '08:00:00' }],
  saturday: [{ from: '07:00:00', to: '24:00:00', data: { temp: 21 } }],
}

describe('schedules', () => {
  it('reads and writes times in minutes, the end of the day as 24:00', () => {
    expect(parseTime('07:30:00')).toBe(450)
    expect(parseTime('24:00:00')).toBe(1440)
    expect(formatTime(450)).toBe('07:30:00')
    expect(formatTime(1440)).toBe('24:00:00')
    expect(shortTime(1290)).toBe('21:30')
  })

  it('gives a day its blocks in order, keeping their data', () => {
    expect(blocksOf(plan, 'monday')).toEqual([{ from: 330, to: 480 }, { from: 1140, to: 1290 }])
    expect(blocksOf(plan, 'saturday')).toEqual([{ from: 420, to: 1440, data: { temp: 21 } }])
    expect(blocksOf(plan, 'sunday')).toEqual([])
  })

  it('finds blocks HA would refuse', () => {
    expect(checkBlocks([{ from: 330, to: 480 }, { from: 1140, to: 1290 }])).toBeUndefined()
    expect(checkBlocks([{ from: 480, to: 480 }])).toBe('order')
    expect(checkBlocks([{ from: 600, to: 900 }, { from: 330, to: 620 }])).toBe('overlap')
    // Touching is fine
    expect(checkBlocks([{ from: 330, to: 480 }, { from: 480, to: 600 }])).toBeUndefined()
  })

  it('counts days from Monday', () => {
    expect(dayOf(new Date(2026, 10, 13))).toBe('friday')
    expect(dayOf(new Date(2026, 10, 15))).toBe('sunday')
  })

  it('puts the blocks on the picked days and sends the whole helper back', () => {
    const next = withBlocks(plan, ['monday', 'tuesday'], [{ from: 1140, to: 1320 }, { from: 360, to: 480 }])
    expect(next.monday).toEqual([{ from: '06:00:00', to: '08:00:00' }, { from: '19:00:00', to: '22:00:00' }])
    expect(next.tuesday).toEqual(next.monday)
    expect(next.saturday).toBe(plan.saturday)
    const msg = updateMessage(next)
    expect(msg).toMatchObject({ type: 'schedule/update', schedule_id: 'heizplan_bader', name: 'Heizplan Bäder', icon: 'mdi:shower', sunday: [] })
    expect(Object.keys(msg)).toEqual(expect.arrayContaining(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
  })

  it('finds the helper behind an entity, also a renamed one', async () => {
    const callWS = vi.fn(async (msg: Record<string, unknown>) => {
      if (msg.type === 'schedule/list') return [plan, { id: 'abc123', name: 'Alt' }]
      if (msg.entity_id === 'schedule.renamed') return { unique_id: 'abc123' }
      throw new Error('not found')
    })
    const hass = { callWS } as unknown as HomeAssistant
    const found = await loadSchedules(hass, ['schedule.heizplan_bader', 'schedule.renamed', 'schedule.from_yaml'])
    expect(found.get('schedule.heizplan_bader')?.name).toBe('Heizplan Bäder')
    expect(found.get('schedule.renamed')?.id).toBe('abc123')
    expect(found.has('schedule.from_yaml')).toBe(false)
  })
})
