import { describe, expect, it } from 'vitest'
import { dayRange, findSchools, lessonsOf, marksFor, mergeLessons, schoolDay, schoolNotes, type School } from '../src/school'
import { createHass } from '../dev/mock'
import type { HomeAssistant } from '../src/types'

// A fixed Monday afternoon in Berlin, school over for today
const NOW = new Date(2026, 10, 9, 16, 0).getTime()
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString()

const school: School = {
  name: 'Joshua', area: 'zimmer_joshua', timetable: 'calendar.plan', next: 'sensor.next',
  today_start: 'sensor.ts', today_end: 'sensor.te', tomorrow_start: 'sensor.ms', tomorrow_end: 'sensor.me',
  cancelled_today: 'sensor.ct', cancelled_tomorrow: 'sensor.cm', changed_today: 'sensor.xt', changed_tomorrow: 'sensor.xm',
  entities: [],
}

function hassWith(states: Record<string, { state: string; attributes?: Record<string, unknown> }>): HomeAssistant {
  return {
    states: Object.fromEntries(Object.entries(states).map(([id, s]) => [id, { entity_id: id, state: s.state, attributes: s.attributes ?? {} }])),
    entities: {}, devices: {}, areas: {}, themes: { darkMode: true }, language: 'de', callService: async () => undefined,
  }
}

const cancelledTomorrow = [
  { start: at(10, 12, 30), end: at(10, 13, 15), subject_long: 'Deutsch', room: 'K310', code: 'cancelled' },
  { start: at(10, 13, 35), end: at(10, 14, 20), subject_long: 'Sozialwissenschaften', room: 'K306', code: 'cancelled' },
]
const events = [
  { summary: 'Physik', start: { dateTime: at(10, 9, 55) }, end: { dateTime: at(10, 10, 40) }, location: 'PH4', description: 'Lehrer: DRE' },
  { summary: 'Physik', start: { dateTime: at(10, 10, 40) }, end: { dateTime: at(10, 11, 25) }, location: 'PH4', description: 'Lehrer: DRE' },
  { summary: 'Deutsch', start: { dateTime: at(10, 11, 45) }, end: { dateTime: at(10, 12, 30) }, location: 'K310' },
  { summary: '❌ Deutsch (entfällt)', start: { dateTime: at(10, 12, 30) }, end: { dateTime: at(10, 13, 15) }, location: 'K310' },
]

describe('school', () => {
  it('finds each pupil from the Untis entities by translation key, named by first name', () => {
    const hass = createHass(true)
    const [leni, tom] = findSchools(hass)
    expect(leni).toMatchObject({ name: 'Leni', area: 'kinderzimmer', timetable: 'calendar.leni_stundenplan', next: 'sensor.leni_nachste_stunde', cancelled_tomorrow: 'sensor.leni_ausfalle_morgen' })
    expect(leni!.entities).toHaveLength(11)
    expect(tom!.name).toBe('Tom')
    expect(findSchools(hass, { domains: ['school'] })).toEqual([])
    expect(findSchools(hass, {}, ['kuche'])).toEqual([])
  })

  it('shows today until school is out, then the day of the next lesson', () => {
    const states = { 'sensor.te': { state: at(9, 15, 5) }, 'sensor.next': { state: 'Physik', attributes: { start: at(10, 9, 55) } } }
    expect(schoolDay(hassWith(states), school, new Date(2026, 10, 9, 10).getTime())).toEqual({ kind: 'today', date: new Date(2026, 10, 9).getTime() })
    expect(schoolDay(hassWith(states), school, NOW)).toEqual({ kind: 'tomorrow', date: new Date(2026, 10, 10).getTime() })
    // Friday afternoon: Monday is "later"
    const friday = { 'sensor.te': { state: at(13, 13, 0) }, 'sensor.next': { state: 'Mathe', attributes: { start: at(16, 8, 0) } } }
    expect(schoolDay(hassWith(friday), school, new Date(2026, 10, 13, 15).getTime())).toEqual({ kind: 'later', date: new Date(2026, 10, 16).getTime() })
    expect(schoolDay(hassWith({}), school, NOW)).toBeUndefined()
  })

  it('marks cancelled lessons from the sensors and the calendar, and strips the mark from the subject', () => {
    const lessons = lessonsOf(events, cancelledTomorrow)
    expect(lessons.map(l => [l.subject, l.room, l.teacher, l.cancelled])).toEqual([
      ['Physik', 'PH4', 'DRE', false], ['Physik', 'PH4', 'DRE', false], ['Deutsch', 'K310', undefined, false],
      ['Deutsch', 'K310', undefined, true],
      // Not in the calendar: added from the sensor
      ['Sozialwissenschaften', 'K306', undefined, true],
    ])
    expect(mergeLessons(lessons).map(l => [l.subject, l.count])).toEqual([['Physik', 2], ['Deutsch', 1], ['Deutsch', 1], ['Sozialwissenschaften', 1]])
  })

  it('reckons the day without cancelled lessons and says when it ends early', () => {
    const hass = hassWith({ 'sensor.cm': { state: '2', attributes: { lessons: cancelledTomorrow } } })
    const lessons = lessonsOf(events, marksFor(hass, school, 'tomorrow'))
    const range = dayRange(hass, school, 'tomorrow', lessons)
    expect(range).toEqual({ start: Date.parse(at(10, 9, 55)), end: Date.parse(at(10, 12, 30)), planned: Date.parse(at(10, 14, 20)) })
    // Without the calendar the sensors give the times
    expect(dayRange(hassWith({ 'sensor.ms': { state: at(10, 8) }, 'sensor.me': { state: at(10, 12, 30) } }), school, 'tomorrow', []))
      .toEqual({ start: Date.parse(at(10, 8)), end: Date.parse(at(10, 12, 30)) })
  })

  it('counts cancelled and changed lessons for the header: tomorrow once school is out today', () => {
    const changed = [{ start: at(10, 8), end: at(10, 8, 45), subject_long: 'Mathe', room: 'R14', room_changed: true, code: 'irregular' }]
    const hass = hassWith({
      'sensor.te': { state: at(9, 15, 5) },
      'sensor.ms': { state: at(10, 8) },
      'sensor.cm': { state: '2', attributes: { lessons: cancelledTomorrow } },
      'sensor.xm': { state: '1', attributes: { lessons: changed } },
    })
    const notes = schoolNotes(hass, [school], NOW)!
    expect(notes.kind).toBe('tomorrow')
    expect(notes.cancelled.map(n => n.lesson.subject)).toEqual(['Deutsch', 'Sozialwissenschaften'])
    expect(notes.changed.map(n => [n.lesson.subject, n.lesson.room])).toEqual([['Mathe', 'R14']])
    expect(schoolNotes(hassWith({}), [school], NOW)).toBeUndefined()
    // One pupil still at school today, the other done: each with their own day, no "today"/"tomorrow" for both
    const other: School = { ...school, name: 'Tom', today_end: 'sensor.te2', changed_today: 'sensor.xt2' }
    hass.states['sensor.te2'] = { entity_id: 'sensor.te2', state: at(9, 17), attributes: {} }
    hass.states['sensor.xt2'] = { entity_id: 'sensor.xt2', state: '1', attributes: { lessons: [{ start: at(9, 16, 10), end: at(9, 16, 55), subject_long: 'Kunst', text: 'Raumtausch', code: 'irregular' }] } }
    const both = schoolNotes(hass, [school, other], NOW)!
    expect(both.kind).toBeUndefined()
    expect(both.changed.map(n => [n.school.name, n.kind, n.lesson.subject])).toEqual([['Joshua', 'tomorrow', 'Mathe'], ['Tom', 'today', 'Kunst']])
  })
})
