// Calendar arithmetic without a card: the days a month or week shows, events from HA's calendar API
// in local time, which events fall on a day, and how overlapping events share a day's column.

export type CalendarView = 'month' | 'week' | 'day'

/** An event as HA's REST API returns it: all-day events have dates, timed ones date-times */
export interface ApiEvent {
  summary?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  description?: string | null
  location?: string | null
  uid?: string | null
  recurrence_id?: string | null
  rrule?: string | null
}

export interface CalEvent {
  id: string
  calendar: string
  title: string
  start: Date
  /** Exclusive, like HA: an all-day event on the 5th ends on the 6th at midnight */
  end: Date
  allDay: boolean
  location?: string
  description?: string
  /** What HA needs to change or delete the event */
  uid?: string
  recurrenceId?: string
  /** Part of a series: changing or deleting asks for this one or this and the following */
  recurring: boolean
}

const DAY_MS = 86_400_000

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
/** Local yyyy-mm-dd */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A date-only value is a local day, not UTC midnight */
function parse(value: { date?: string; dateTime?: string }): Date | undefined {
  if (value.dateTime) return new Date(value.dateTime)
  if (value.date) {
    const [y, m, d] = value.date.split('-').map(Number)
    return new Date(y!, m! - 1, d!)
  }
  return undefined
}

export function toEvent(calendar: string, e: ApiEvent, i: number): CalEvent | undefined {
  const start = parse(e.start)
  const end = parse(e.end) ?? start
  if (!start || !end) return undefined
  const allDay = !e.start.dateTime
  return {
    id: `${calendar}|${e.uid ?? i}|${e.recurrence_id ?? start.toISOString()}`,
    calendar, title: e.summary?.trim() || '–', start,
    // A zero-length all-day event still covers its day
    end: allDay && end <= start ? addDays(start, 1) : end,
    allDay,
    ...(e.location ? { location: e.location } : {}),
    ...(e.description ? { description: e.description } : {}),
    ...(e.uid ? { uid: e.uid } : {}),
    ...(e.recurrence_id ? { recurrenceId: e.recurrence_id } : {}),
    recurring: !!(e.rrule || e.recurrence_id),
  }
}

/** First day of the week the date is in; 1 = Monday, 0 = Sunday */
export function weekStart(d: Date, firstDay = 1) {
  const diff = (d.getDay() - firstDay + 7) % 7
  return addDays(startOfDay(d), -diff)
}

/** The days a view shows: six whole weeks for a month, seven days for a week, one for a day. */
export function viewDays(view: CalendarView, anchor: Date, firstDay = 1): Date[] {
  if (view === 'day') return [startOfDay(anchor)]
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor, firstDay), i))
  const first = weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1), firstDay)
  // Five weeks when the month fits, so no row is all next month
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const weeks = Math.ceil((Math.round((startOfDay(last).getTime() - first.getTime()) / DAY_MS) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i))
}

/** The date the arrows lead to: a month, a week or a day away. */
export function step(view: CalendarView, anchor: Date, by: number): Date {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + by, 1)
  return addDays(anchor, by * (view === 'week' ? 7 : 1))
}

/** Events touching a day, all-day ones first, then by start. */
export function eventsOn(events: CalEvent[], day: Date): CalEvent[] {
  const from = startOfDay(day).getTime()
  const to = addDays(day, 1).getTime()
  return events
    .filter(e => e.start.getTime() < to && e.end.getTime() > from)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title))
}

export interface Placed {
  event: CalEvent
  /** Minutes from the day's midnight, clipped to the day */
  top: number
  height: number
  column: number
  columns: number
}

/** Timed events of one day in columns, so overlapping ones stand side by side. */
export function layoutDay(events: CalEvent[], day: Date): Placed[] {
  const from = startOfDay(day).getTime()
  const timed = eventsOn(events, day).filter(e => !e.allDay)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -Infinity
  const close = () => {
    const columns = Math.max(1, ...cluster.map(p => p.column + 1))
    for (const p of cluster) p.columns = columns
    cluster = []
  }
  for (const event of timed) {
    const top = Math.max(0, (event.start.getTime() - from) / 60_000)
    const bottom = Math.min(24 * 60, (event.end.getTime() - from) / 60_000)
    // At least a quarter hour high, so a short event stays readable
    const p: Placed = { event, top, height: Math.max(15, bottom - top), column: 0, columns: 1 }
    if (top >= clusterEnd) { close(); clusterEnd = -Infinity }
    const taken = new Set(cluster.filter(c => c.top + c.height > top).map(c => c.column))
    while (taken.has(p.column)) p.column++
    cluster.push(p)
    placed.push(p)
    clusterEnd = Math.max(clusterEnd, top + p.height)
  }
  close()
  return placed
}

/** Calendar colors: distinct hues that read on dark and light, as r, g, b */
export const CALENDAR_COLORS = ['59, 130, 246', '34, 197, 94', '245, 158, 11', '236, 72, 153', '20, 184, 166', '168, 85, 247', '239, 68, 68', '132, 204, 22']

/** calendar entity supported_features bits */
export const CAL_CREATE = 1
export const CAL_DELETE = 2
export const CAL_UPDATE = 4

/** An event as the form holds it: dates and times as the inputs give them, the end day inclusive */
export interface EventDraft {
  calendar: string
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  location: string
  description: string
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const localDate = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y!, m! - 1, d!) }
const localTime = (date: string, time: string) => { const d = localDate(date); const [h, m] = time.split(':').map(Number); d.setHours(h ?? 0, m ?? 0); return d }

/** A new event of an hour from the given start */
export function newDraft(calendar: string, start: Date, allDay = false): EventDraft {
  const end = new Date(start.getTime() + 3_600_000)
  return { calendar, title: '', allDay, startDate: dayKey(start), startTime: hhmm(start), endDate: dayKey(allDay ? start : end), endTime: hhmm(end), location: '', description: '' }
}

export function draftOf(e: CalEvent): EventDraft {
  const last = e.allDay ? addDays(e.end, -1) : e.end
  return {
    calendar: e.calendar, title: e.title === '–' ? '' : e.title, allDay: e.allDay,
    startDate: dayKey(e.start), startTime: hhmm(e.start), endDate: dayKey(last), endTime: hhmm(e.end),
    location: e.location ?? '', description: e.description ?? '',
  }
}

/** A new start moves the end along, so the event keeps its length */
export function moveStart(d: EventDraft, startDate: string, startTime: string): EventDraft {
  if (d.allDay) {
    const days = Math.round((localDate(d.endDate).getTime() - localDate(d.startDate).getTime()) / DAY_MS)
    return { ...d, startDate, endDate: dayKey(addDays(localDate(startDate), Math.max(0, days))) }
  }
  const length = Math.max(0, localTime(d.endDate, d.endTime).getTime() - localTime(d.startDate, d.startTime).getTime())
  const end = new Date(localTime(startDate, startTime).getTime() + length)
  return { ...d, startDate, startTime, endDate: dayKey(end), endTime: hhmm(end) }
}

/** Local date-time with its offset, so HA reads it in the time the person meant */
export function localIso(d: Date) {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${dayKey(d)}T${hhmm(d)}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** The event for HA's calendar/event/create and update, or why it cannot be saved */
export function draftPayload(d: EventDraft): { event: Record<string, string> } | { error: 'title' | 'end' } {
  const summary = d.title.trim()
  if (!summary) return { error: 'title' }
  const extra = { ...(d.location.trim() ? { location: d.location.trim() } : {}), ...(d.description.trim() ? { description: d.description.trim() } : {}) }
  if (d.allDay) {
    if (d.endDate < d.startDate) return { error: 'end' }
    // HA's end of an all-day event is the day after
    return { event: { summary, dtstart: d.startDate, dtend: dayKey(addDays(localDate(d.endDate), 1)), ...extra } }
  }
  const start = localTime(d.startDate, d.startTime)
  const end = localTime(d.endDate, d.endTime)
  if (end <= start) return { error: 'end' }
  return { event: { summary, dtstart: localIso(start), dtend: localIso(end), ...extra } }
}
