import { describe, expect, it } from 'vitest'
import { dayKey, draftOf, draftPayload, eventsOn, layoutDay, localIso, moveStart, newDraft, step, toEvent, viewDays, weekStart } from '../src/calendar'

const at = (s: string) => new Date(s)

describe('calendar', () => {
  it('shows whole weeks for a month, Monday first, and only as many as the month needs', () => {
    // November 2026 starts on a Sunday: the first row begins on Monday, October 26
    const nov = viewDays('month', at('2026-11-06T12:00'))
    expect(dayKey(nov[0]!)).toBe('2026-10-26')
    expect(nov.length).toBe(42)
    // February 2027 starts on a Monday and fills exactly four weeks
    expect(viewDays('month', at('2027-02-10T12:00')).length).toBe(28)
    expect(dayKey(viewDays('week', at('2026-11-06T12:00'))[0]!)).toBe('2026-11-02')
    expect(dayKey(weekStart(at('2026-11-06T12:00'), 0))).toBe('2026-11-01')
    expect(viewDays('day', at('2026-11-06T18:00')).map(dayKey)).toEqual(['2026-11-06'])
  })

  it('steps a month, a week or a day', () => {
    expect(dayKey(step('month', at('2026-01-31T12:00'), 1))).toBe('2026-02-01')
    expect(dayKey(step('week', at('2026-11-06T12:00'), -1))).toBe('2026-10-30')
    expect(dayKey(step('day', at('2026-12-31T12:00'), 1))).toBe('2027-01-01')
  })

  it('reads all-day events as local days, with the end exclusive', () => {
    const e = toEvent('calendar.familie', { summary: 'Urlaub', start: { date: '2026-11-05' }, end: { date: '2026-11-07' } }, 0)!
    expect(e.allDay).toBe(true)
    expect(eventsOn([e], at('2026-11-06T00:00')).length).toBe(1)
    expect(eventsOn([e], at('2026-11-07T00:00')).length).toBe(0)
    // Some calendars send an all-day event with the same start and end
    expect(toEvent('c', { start: { date: '2026-11-05' }, end: { date: '2026-11-05' } }, 0)!.end.getDate()).toBe(6)
  })

  it('lists all-day events first, then by start', () => {
    const a = toEvent('c', { summary: 'Spät', start: { dateTime: '2026-11-06T18:00:00' }, end: { dateTime: '2026-11-06T19:00:00' } }, 0)!
    const b = toEvent('c', { summary: 'Früh', start: { dateTime: '2026-11-06T08:00:00' }, end: { dateTime: '2026-11-06T09:00:00' } }, 1)!
    const c = toEvent('c', { summary: 'Ganztags', start: { date: '2026-11-06' }, end: { date: '2026-11-07' } }, 2)!
    expect(eventsOn([a, b, c], at('2026-11-06T12:00')).map(e => e.title)).toEqual(['Ganztags', 'Früh', 'Spät'])
  })

  it('puts overlapping events side by side and lets the next one start fresh', () => {
    const ev = (title: string, from: string, to: string) => toEvent('c', { summary: title, start: { dateTime: `2026-11-06T${from}:00` }, end: { dateTime: `2026-11-06T${to}:00` } }, 0)!
    const placed = layoutDay([ev('A', '09:00', '10:30'), ev('B', '09:30', '10:00'), ev('C', '10:00', '11:00'), ev('D', '12:00', '12:05')], at('2026-11-06T00:00'))
    expect(placed.map(p => [p.event.title, p.column, p.columns, p.top, p.height])).toEqual([
      ['A', 0, 2, 540, 90], ['B', 1, 2, 570, 30], ['C', 1, 2, 600, 60],
      // Five minutes still get a quarter hour of height
      ['D', 0, 1, 720, 15],
    ])
  })

  it('keeps what HA needs to change an event, and knows a series', () => {
    const one = toEvent('c', { summary: 'A', uid: 'u1', start: { dateTime: '2026-11-06T08:00:00' }, end: { dateTime: '2026-11-06T09:00:00' } }, 0)!
    expect([one.uid, one.recurrenceId, one.recurring]).toEqual(['u1', undefined, false])
    const series = toEvent('c', { summary: 'B', uid: 'u2', recurrence_id: '20261106', rrule: 'FREQ=WEEKLY', start: { date: '2026-11-06' }, end: { date: '2026-11-07' } }, 0)!
    expect([series.recurrenceId, series.recurring]).toEqual(['20261106', true])
  })
})

describe('event form', () => {
  it('starts a new event with an hour, and an all-day one on its day', () => {
    expect(newDraft('calendar.familie', at('2026-11-06T23:30'))).toMatchObject({ startDate: '2026-11-06', startTime: '23:30', endDate: '2026-11-07', endTime: '00:30', allDay: false })
    expect(newDraft('c', at('2026-11-06T00:00'), true)).toMatchObject({ startDate: '2026-11-06', endDate: '2026-11-06', allDay: true })
  })

  it('opens an event with its inclusive last day', () => {
    const e = toEvent('c', { summary: 'Urlaub', start: { date: '2026-11-05' }, end: { date: '2026-11-08' } }, 0)!
    expect(draftOf(e)).toMatchObject({ title: 'Urlaub', startDate: '2026-11-05', endDate: '2026-11-07', allDay: true })
  })

  it('moves the end along with the start', () => {
    const d = { ...newDraft('c', at('2026-11-06T10:00')), endTime: '12:30' }
    expect(moveStart(d, '2026-11-07', '22:00')).toMatchObject({ startDate: '2026-11-07', startTime: '22:00', endDate: '2026-11-08', endTime: '00:30' })
    const all = { ...newDraft('c', at('2026-11-06T00:00'), true), endDate: '2026-11-08' }
    expect(moveStart(all, '2026-11-10', '')).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-12' })
  })

  it('builds what HA saves: dates with the end a day later, or local times with their offset', () => {
    const all = { ...newDraft('c', at('2026-11-06T00:00'), true), title: ' Urlaub ', endDate: '2026-11-07' }
    expect(draftPayload(all)).toEqual({ event: { summary: 'Urlaub', dtstart: '2026-11-06', dtend: '2026-11-08' } })
    const timed = { ...newDraft('c', at('2026-11-06T10:00')), title: 'Zahnarzt', location: 'Praxis' }
    expect(draftPayload(timed)).toEqual({ event: { summary: 'Zahnarzt', dtstart: localIso(at('2026-11-06T10:00')), dtend: localIso(at('2026-11-06T11:00')), location: 'Praxis' } })
    expect(localIso(at('2026-11-06T10:00'))).toMatch(/^2026-11-06T10:00:00[+-]\d\d:\d\d$/)
    expect(draftPayload({ ...timed, title: '  ' })).toEqual({ error: 'title' })
    expect(draftPayload({ ...timed, endTime: '09:00' })).toEqual({ error: 'end' })
  })
})
