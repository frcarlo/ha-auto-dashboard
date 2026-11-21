import { describe, expect, it } from 'vitest'
import { countdown, durationLabel, durationMs, timerName } from '../src/cards/timers'
import type { HassEntity } from '../src/types'

const timer = (name: string, duration: string): HassEntity => ({ entity_id: 'timer.x', state: 'idle', attributes: { friendly_name: name, duration } })

describe('timer buttons', () => {
  it('says how long a timer runs the short way', () => {
    expect(durationMs('0:10:00')).toBe(600_000)
    expect(durationMs('soon')).toBeUndefined()
    expect(durationLabel(5_000)).toBe('5 s')
    expect(durationLabel(600_000)).toBe('10 min')
    expect(durationLabel(3_600_000)).toBe('1 h')
    expect(durationLabel(5_400_000)).toBe('1 h 30 min')
    expect(countdown(200_000)).toBe('3:20')
    expect(countdown(3_723_000)).toBe('1:02:03')
  })

  it('names a timer called after its length by the length, one with a name of its own by its name', () => {
    expect(timerName(timer('Timer 10 Minuten', '0:10:00'))).toEqual({ name: '10 min' })
    expect(timerName(timer('Timer 1 Stunde', '1:00:00'))).toEqual({ name: '1 h' })
    expect(timerName(timer('Nudeln', '0:08:00'))).toEqual({ name: 'Nudeln', length: '8 min' })
  })
})
