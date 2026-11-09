// School timetables from the WebUntis integration: one entry per pupil (one device each), its entities found by
// translation key so the German entity ids don't matter. The day shown is today while school is still on,
// otherwise the next day with lessons; the calendar brings every lesson, the sensors which ones are cancelled or changed.
import { allEntities, entityAreaId, type Hide } from './model'
import type { HassEntity, HomeAssistant } from './types'

export interface School {
  /** First name of the pupil, or the device's own name when set by hand */
  name: string
  area?: string
  timetable?: string
  current?: string
  next?: string
  today_start?: string
  today_end?: string
  tomorrow_start?: string
  tomorrow_end?: string
  cancelled_today?: string
  cancelled_tomorrow?: string
  changed_today?: string
  changed_tomorrow?: string
  /** Every entity of the pupil, so the room page doesn't list them again as tiles */
  entities: string[]
}

type Role = Exclude<keyof School, 'name' | 'area' | 'entities'>

const ROLES: Record<string, Role> = {
  timetable: 'timetable',
  current_lesson: 'current',
  next_lesson: 'next',
  today_start: 'today_start',
  today_end: 'today_end',
  tomorrow_start: 'tomorrow_start',
  tomorrow_end: 'tomorrow_end',
  cancelled_today: 'cancelled_today',
  cancelled_tomorrow: 'cancelled_tomorrow',
  changed_today: 'changed_today',
  changed_tomorrow: 'changed_tomorrow',
}

/** Pupils with a WebUntis timetable, sorted by name; hidden or out-of-scope ones stay out. */
export function findSchools(hass: HomeAssistant, hide: Hide = {}, areaIds?: string[]): School[] {
  if (hide.domains?.includes('school')) return []
  const visible = new Set(allEntities(hass, hide, areaIds).map(e => e.entity_id))
  const byDevice = new Map<string, string[]>()
  for (const entry of Object.values(hass.entities)) {
    if (entry.platform !== 'untis' || !entry.device_id || !hass.states[entry.entity_id]) continue
    byDevice.set(entry.device_id, [...(byDevice.get(entry.device_id) ?? []), entry.entity_id])
  }
  const found: School[] = []
  for (const [deviceId, ids] of byDevice) {
    const roles: Partial<Record<Role, string>> = {}
    for (const id of ids) {
      const role = ROLES[hass.entities[id]?.translation_key ?? '']
      if (role) roles[role] = id
    }
    const anchor = roles.timetable ?? roles.next
    if (!anchor || !visible.has(anchor)) continue
    const device = hass.devices[deviceId]
    found.push({
      name: device?.name_by_user ?? (device?.name ?? '').split(/\s+/)[0] ?? '',
      area: entityAreaId(hass, anchor),
      ...roles,
      entities: ids,
    })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** A lesson as the card shows it */
export interface Lesson {
  start: number
  end: number
  subject: string
  room?: string
  teacher?: string
  cancelled: boolean
  room_changed: boolean
  teacher_changed: boolean
  /** The school's note, e.g. "Vertretung" or a room swap */
  text?: string
}

/** A calendar event as HA's REST API returns it */
export interface ApiEvent {
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location?: string
  description?: string
}

/** One entry of the cancelled/changed sensors' `lessons` attribute */
interface SensorLesson {
  start?: string
  end?: string
  subject?: string
  subject_long?: string
  room?: string
  room_changed?: boolean
  teacher?: string
  teacher_changed?: boolean
  code?: string
  text?: string | null
}

// The integration marks cancelled lessons in the calendar with "❌ Deutsch (entfällt)"
const CANCEL_MARK = /^\s*❌\s*|\s*\((entfällt|cancelled)\)\s*$/gi
const MARKED = /❌|\((entfällt|cancelled)\)/i

const time = (value?: string) => {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : undefined
}

const teacherOf = (description?: string) => description?.match(/:\s*(.+)$/m)?.[1]?.trim() || undefined

const sensorLessons = (hass: HomeAssistant, id?: string): SensorLesson[] => {
  const list = id ? hass.states[id]?.attributes.lessons : undefined
  return Array.isArray(list) ? list : []
}

/**
 * The day's lessons: every calendar event, marked cancelled or changed from the sensors (matched by start
 * and subject). Cancelled lessons the calendar leaves out are added from the sensors.
 */
export function lessonsOf(events: ApiEvent[], marks: SensorLesson[] = []): Lesson[] {
  const used = new Set<SensorLesson>()
  const lessons: Lesson[] = []
  for (const e of events) {
    const start = time(e.start.dateTime)
    const end = time(e.end.dateTime)
    if (start === undefined || end === undefined) continue
    const subject = (e.summary ?? '').replace(CANCEL_MARK, '').trim()
    const mark = marks.find(m => !used.has(m) && time(m.start) === start && (!m.subject_long || m.subject_long === subject))
      ?? marks.find(m => !used.has(m) && time(m.start) === start)
    if (mark) used.add(mark)
    lessons.push({
      start, end, subject,
      ...(e.location || mark?.room ? { room: e.location || mark?.room } : {}),
      ...(teacherOf(e.description) || mark?.teacher ? { teacher: teacherOf(e.description) || mark?.teacher } : {}),
      cancelled: mark?.code === 'cancelled' || MARKED.test(e.summary ?? ''),
      room_changed: !!mark?.room_changed,
      teacher_changed: !!mark?.teacher_changed,
      ...(mark?.text ? { text: mark.text } : {}),
    })
  }
  for (const m of marks) {
    const start = time(m.start)
    const end = time(m.end)
    if (used.has(m) || start === undefined || end === undefined) continue
    lessons.push({
      start, end, subject: m.subject_long || m.subject || '',
      ...(m.room ? { room: m.room } : {}), ...(m.teacher ? { teacher: m.teacher } : {}),
      cancelled: m.code === 'cancelled', room_changed: !!m.room_changed, teacher_changed: !!m.teacher_changed,
      ...(m.text ? { text: m.text } : {}),
    })
  }
  return lessons.sort((a, b) => a.start - b.start)
}

export const isChanged = (l: Lesson) => !l.cancelled && (l.room_changed || l.teacher_changed || !!l.text)

const midnight = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const sameDay = (a: number, b: number) => midnight(a) === midnight(b)

export type DayKind = 'today' | 'tomorrow' | 'later'

/** Which day the card is about: today until school is out, then the day of the next lesson. */
export function schoolDay(hass: HomeAssistant, school: School, now: number): { kind: DayKind; date: number } | undefined {
  const state = (id?: string) => (id ? time(hass.states[id]?.state) : undefined)
  const todayEnd = state(school.today_end)
  if (todayEnd !== undefined && todayEnd > now && sameDay(todayEnd, now)) return { kind: 'today', date: midnight(now) }
  const next = time(school.next ? hass.states[school.next]?.attributes.start : undefined) ?? state(school.tomorrow_start)
  if (next === undefined) return undefined
  const date = midnight(next)
  const tomorrow = midnight(midnight(now) + 36 * 3600_000)
  return { kind: date === midnight(now) ? 'today' : date === tomorrow ? 'tomorrow' : 'later', date }
}

/** The sensors' cancelled and changed lessons for today or tomorrow; none for days further out */
export function marksFor(hass: HomeAssistant, school: School, kind: DayKind): SensorLesson[] {
  if (kind === 'later') return []
  return [
    ...sensorLessons(hass, kind === 'today' ? school.cancelled_today : school.cancelled_tomorrow),
    ...sensorLessons(hass, kind === 'today' ? school.changed_today : school.changed_tomorrow),
  ]
}

/** Start and end of the day without cancelled lessons, and the end as planned when it moved forward */
export function dayRange(hass: HomeAssistant, school: School, kind: DayKind, lessons: Lesson[]) {
  const held = lessons.filter(l => !l.cancelled)
  const state = (id?: string) => (id ? time(hass.states[id]?.state) : undefined)
  const start = held[0]?.start ?? state(kind === 'today' ? school.today_start : kind === 'tomorrow' ? school.tomorrow_start : undefined)
  const end = held.length ? Math.max(...held.map(l => l.end)) : state(kind === 'today' ? school.today_end : kind === 'tomorrow' ? school.tomorrow_end : undefined)
  const planned = lessons.length ? Math.max(...lessons.map(l => l.end)) : undefined
  return { start, end, ...(planned !== undefined && end !== undefined && planned > end ? { planned } : {}) }
}

/** What the header chips show: cancelled and changed lessons, each pupil's for their own next school day */
export interface SchoolNote {
  school: School
  lesson: Lesson
  kind: 'today' | 'tomorrow'
}

export function schoolNotes(hass: HomeAssistant, schools: School[], now: number): { kind?: 'today' | 'tomorrow'; cancelled: SchoolNote[]; changed: SchoolNote[] } | undefined {
  const notes = schools.flatMap(school => {
    // One pupil still at school today, another one's tomorrow: each counts their own day
    const kind = schoolDay(hass, school, now)?.kind
    if (kind !== 'today' && kind !== 'tomorrow') return []
    return lessonsOf([], marksFor(hass, school, kind))
      // Today's lessons that are over don't need anyone any more
      .filter(lesson => kind === 'tomorrow' || lesson.end > now)
      .map(lesson => ({ school, lesson, kind }))
  })
  const cancelled = notes.filter(n => n.lesson.cancelled)
  const changed = notes.filter(n => isChanged(n.lesson))
  if (!cancelled.length && !changed.length) return undefined
  const kinds = new Set(notes.map(n => n.kind))
  // "heute" or "morgen" on the chip only when it's true for all of them
  return { ...(kinds.size === 1 ? { kind: [...kinds][0] } : {}), cancelled, changed }
}

/** The pupil's entity states, for re-rendering */
export const schoolIds = (schools: School[]) => schools.flatMap(s => s.entities)

/** The lesson a sensor reports now or next, when the calendar isn't loaded */
export function sensorLesson(entity: HassEntity | undefined): Lesson | undefined {
  const a = entity?.attributes
  const start = time(a?.start)
  const end = time(a?.end)
  if (!a || start === undefined || end === undefined) return undefined
  return {
    start, end, subject: a.subject_long || a.subject || entity!.state,
    ...(a.room ? { room: a.room } : {}), ...(a.teacher ? { teacher: a.teacher } : {}),
    cancelled: a.status === 'cancelled', room_changed: !!a.room_changed, teacher_changed: !!a.teacher_changed,
    ...(a.text ? { text: a.text } : {}),
  }
}

/** Double lessons as one: the same subject in the same room right after another */
export function mergeLessons(lessons: Lesson[]): Array<Lesson & { count: number }> {
  const out: Array<Lesson & { count: number }> = []
  for (const l of lessons) {
    const last = out[out.length - 1]
    if (last && last.end === l.start && last.subject === l.subject && last.room === l.room && last.cancelled === l.cancelled && isChanged(last) === isChanged(l)) {
      last.end = l.end
      last.count++
    } else out.push({ ...l, count: 1 })
  }
  return out
}
