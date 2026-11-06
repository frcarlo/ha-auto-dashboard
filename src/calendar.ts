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
