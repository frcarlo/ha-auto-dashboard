// A pupil's school day from WebUntis. While school is on: the lesson now (or the next one in a break) and when
// school ends. Otherwise the next school day: from when to when, and whether it ends early. A strip shows the day's
// lessons as bars, cancelled ones red, changed ones amber, a line where now is. On Home it lists only what's
// different; in the pupil's room every lesson.
import { css, html, nothing, type PropertyValues } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import {
  dayRange, isChanged, lessonsOf, marksFor, mergeLessons, schoolDay, sensorLesson,
  type ApiEvent, type DayKind, type Lesson, type School,
} from '../school'
import { tokens } from '../styles/tokens'

interface SchoolCardConfig extends BaseConfig {
  school: School
  /** The pupil's room: every lesson of the day */
  full?: boolean
  /** Home: the pupil's room page, opened by a tap */
  path?: string
}

/** Re-reckons now, current lesson and the strip */
const TICK_MS = 30_000
/** The timetable is fetched again after this, or when the calendar entity changes */
const STALE_MS = 15 * 60_000
/** Home lists at most this many changes; the room shows them all */
const COMPACT_ROWS = 3

export class AdSchool extends BaseCard<SchoolCardConfig> {
  static properties = { ...BaseCard.properties, now: { state: true }, events: { state: true } }
  now = Date.now()
  /** The shown day's calendar events, keyed by timetable and day */
  events?: { key: string; list: ApiEvent[]; at: number }
  private timer?: number
  private loading?: string
  private seenCalendar?: unknown

  static styles = [tokens, css`
    :host { display: block; height: 100%; }
    :host([hidden]) { display: none; }
    .card { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
    .card.link { cursor: pointer; }
    .card:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }

    .head { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: var(--ad-fs-m); }
    .head ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); flex: 0 0 auto; }
    .head .who { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .head .day { margin-left: auto; font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; }

    .main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .eyebrow { font-size: var(--ad-fs-s); font-weight: 500; color: rgb(var(--ad-primary)); }
    .big { font-size: var(--ad-fs-xl); font-weight: 400; line-height: 1.15; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
    .sub { font-size: var(--ad-fs-s); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; }
    .sub.early { opacity: 1; color: rgb(var(--ad-warning)); }

    /* The day: one bar per lesson between the first and the last, now as a line */
    .strip { display: flex; flex-direction: column; gap: 4px; }
    .bars { position: relative; height: 10px; }
    .bar { position: absolute; top: 0; bottom: 0; border-radius: 3px; background: rgba(var(--ad-primary), 0.5); }
    .bar.past { background: rgba(var(--ad-on-surface), 0.18); }
    .bar.current { background: rgb(var(--ad-primary)); }
    .bar.changed { background: rgb(var(--ad-warning)); }
    .bar.cancelled {
      background: repeating-linear-gradient(135deg, rgba(var(--ad-error), 0.75) 0 3px, rgba(var(--ad-error), 0.2) 3px 6px);
    }
    .bar.past.changed, .bar.past.cancelled { opacity: 0.45; }
    .nowline { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: rgb(var(--ad-on-surface)); }
    .ends { display: flex; justify-content: space-between; font-size: var(--ad-fs-xs); opacity: var(--ad-o3); font-variant-numeric: tabular-nums; }

    .rows { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: baseline; gap: 2px 10px; padding: 6px 0; font-size: var(--ad-fs-m); }
    .rows .row + .row { border-top: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .row .at { font-size: var(--ad-fs-s); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; }
    .row .what { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .what small { font-size: var(--ad-fs-s); opacity: var(--ad-o3); margin-left: 4px; }
    .row .where { font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; }
    .row .note { grid-column: 2 / -1; font-size: var(--ad-fs-s); }
    .row.past { opacity: 0.45; }
    .row.current .what { font-weight: 600; }
    .row.current .at { color: rgb(var(--ad-primary)); opacity: 1; }
    .row.cancelled .what { text-decoration: line-through; text-decoration-color: rgba(var(--ad-error), 0.8); }
    .row.cancelled .note { color: rgb(var(--ad-error)); }
    .row.changed .note, .row.changed .where { color: rgb(var(--ad-warning)); opacity: 1; }
    .empty { font-size: var(--ad-fs-m); opacity: var(--ad-o2); }
  `]

  getGridOptions() {
    return { columns: 12, rows: 'auto' }
  }

  getCardSize() {
    return this.config?.full ? 6 : 3
  }

  protected watched() {
    return this.config!.school.entities
  }

  connectedCallback() {
    super.connectedCallback()
    this.timer = window.setInterval(() => (this.now = Date.now()), TICK_MS)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
  }

  private get day() {
    return schoolDay(this.hass!, this.config!.school, this.now)
  }

  /** The shown day's events from HA's calendar API, unless what's there is fresh and the calendar unchanged */
  private async load() {
    const { school } = this.config!
    const day = this.day
    const api = this.hass?.callApi
    if (!day || !school.timetable || !api) return
    const key = `${school.timetable}|${day.date}`
    const calendar = this.hass!.states[school.timetable]
    const fresh = this.events?.key === key && Date.now() - this.events.at < STALE_MS && this.seenCalendar === calendar
    if (fresh || this.loading === key) return
    this.loading = key
    this.seenCalendar = calendar
    const from = new Date(day.date)
    const to = new Date(day.date + 36 * 3600_000)
    to.setHours(0, 0, 0, 0)
    try {
      const list = await api<ApiEvent[]>('GET', `calendars/${school.timetable}?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`)
      this.events = { key, list, at: Date.now() }
    } catch {
      // Without the calendar the card makes do with the sensors
      this.events = { key, list: [], at: Date.now() }
    } finally {
      this.loading = undefined
    }
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has('hass') || changed.has('config') || changed.has('now')) void this.load()
    this.toggleAttribute('hidden', !this.config!.full && !this.day)
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.hass?.locale?.language ?? this.hass?.language, { hour: 'numeric', minute: '2-digit' })
  }

  private dayLabel(kind: DayKind, date: number) {
    if (kind === 'today') return t(this.hass, 'school.today')
    if (kind === 'tomorrow') return t(this.hass, 'school.tomorrow')
    return new Date(date).toLocaleDateString(this.hass?.locale?.language ?? this.hass?.language, { weekday: 'short', day: 'numeric', month: 'numeric' })
  }

  /** The day's lessons: from the calendar once it's there, until then from the sensors */
  private lessons(kind: DayKind, date: number): Lesson[] {
    const { school } = this.config!
    const marks = marksFor(this.hass!, school, kind)
    const events = this.events?.key === `${school.timetable}|${date}` ? this.events.list : undefined
    if (events?.length) return lessonsOf(events, marks)
    const known = [sensorLesson(this.hass!.states[school.current ?? '']), sensorLesson(this.hass!.states[school.next ?? ''])]
      .filter((l): l is Lesson => !!l && new Date(l.start).toDateString() === new Date(date).toDateString())
    return lessonsOf([], marks).concat(known.filter(k => !marks.some(m => Date.parse(m.start ?? '') === k.start))).sort((a, b) => a.start - b.start)
  }

  private renderMain(kind: DayKind, lessons: Lesson[], range: ReturnType<typeof dayRange>) {
    const now = this.now
    const held = lessons.filter(l => !l.cancelled)
    const during = kind === 'today' && range.start !== undefined && range.start <= now
    const current = during ? held.find(l => l.start <= now && l.end > now) : undefined
    const next = during ? held.find(l => l.start > now) : undefined
    const where = (l: Lesson) => (l.room ? ` · ${l.room}` : '')
    const ends = range.end !== undefined ? t(this.hass, 'school.ends', { time: this.time(range.end) }) : ''
    if (current) {
      return html`<div class="main">
        <span class="eyebrow">${t(this.hass, 'school.now')}</span>
        <span class="big">${current.subject}</span>
        <span class="sub">${current.room ? `${current.room} · ` : ''}${t(this.hass, 'school.until', { time: this.time(current.end) })}${next ? ` · ${ends}` : ''}</span>
      </div>`
    }
    if (next) {
      // A break: what comes next and from when
      return html`<div class="main">
        <span class="eyebrow">${t(this.hass, 'school.soon')}</span>
        <span class="big">${next.subject}</span>
        <span class="sub">${t(this.hass, 'school.from', { time: this.time(next.start) })}${where(next)} · ${ends}</span>
      </div>`
    }
    if (range.start === undefined || range.end === undefined) return html`<div class="main"><span class="big">${t(this.hass, 'school.none')}</span></div>`
    const first = held[0]
    return html`<div class="main">
      <span class="big">${this.time(range.start)} – ${this.time(range.end)}</span>
      ${range.planned !== undefined
        ? html`<span class="sub early">${t(this.hass, 'school.early', { time: this.time(range.planned) })}</span>`
        : first ? html`<span class="sub">${t(this.hass, 'school.first', { subject: first.subject })}${where(first)}</span>` : nothing}
    </div>`
  }

  private renderStrip(kind: DayKind, lessons: Lesson[]) {
    if (!lessons.length) return nothing
    const from = lessons[0]!.start
    const to = Math.max(...lessons.map(l => l.end))
    const span = Math.max(to - from, 1)
    const pos = (ms: number) => `${((ms - from) / span) * 100}%`
    const now = kind === 'today' ? this.now : -Infinity
    return html`<div class="strip" aria-hidden="true">
      <div class="bars">
        ${lessons.map(l => {
          const state = l.cancelled ? 'cancelled' : isChanged(l) ? 'changed' : ''
          const time = l.end <= now ? 'past' : l.start <= now ? 'current' : ''
          // A hair of space between back-to-back lessons
          return html`<span class="bar ${state} ${time}" style="left: calc(${pos(l.start)} + 1px); width: calc(${((l.end - l.start) / span) * 100}% - 2px)"></span>`
        })}
        ${now >= from && now <= to ? html`<span class="nowline" style="left: ${pos(now)}"></span>` : nothing}
      </div>
      <div class="ends"><span>${this.time(from)}</span><span>${this.time(to)}</span></div>
    </div>`
  }

  private note(l: Lesson) {
    if (l.cancelled) return t(this.hass, 'school.cancelled')
    // The school's own note says it best; "other room" only when there is none
    return [l.text, !l.text && l.room_changed ? t(this.hass, 'school.room_changed') : '', l.teacher_changed ? t(this.hass, 'school.teacher_changed') : '']
      .filter(Boolean).join(' · ')
  }

  private renderRows(kind: DayKind, lessons: Lesson[]) {
    const full = !!this.config!.full
    const now = kind === 'today' ? this.now : -Infinity
    const merged = mergeLessons(lessons)
    // Home: only what's different from the usual day, and only what's still ahead
    const rows = full ? merged : merged.filter(l => (l.cancelled || isChanged(l)) && l.end > now).slice(0, COMPACT_ROWS)
    if (!rows.length) return nothing
    return html`<ul class="rows">${rows.map(l => {
      const state = l.cancelled ? 'cancelled' : isChanged(l) ? 'changed' : ''
      const time = l.end <= now ? 'past' : l.start <= now ? 'current' : ''
      const note = this.note(l)
      return html`<li class="row ${state} ${time}">
        <span class="at">${this.time(l.start)}</span>
        <span class="what">${l.subject}${l.count > 1 ? html`<small>${t(this.hass, 'school.double', { n: l.count })}</small>` : nothing}</span>
        <span class="where">${l.room ?? ''}</span>
        ${note ? html`<span class="note">${note}</span>` : nothing}
      </li>`
    })}</ul>`
  }

  protected render() {
    const { school, path, full } = this.config!
    const day = this.day
    const open = () => path && this.navigate(path)
    const head = html`<div class="head">
      <ha-icon icon="mdi:school-outline"></ha-icon>
      <span class="who">${school.name}</span>
      ${day ? html`<span class="day">${this.dayLabel(day.kind, day.date)}</span>` : nothing}
    </div>`
    if (!day) {
      return full ? html`<div class="card">${head}<span class="empty">${t(this.hass, 'school.none')}</span></div>` : nothing
    }
    const lessons = this.lessons(day.kind, day.date)
    const range = dayRange(this.hass!, school, day.kind, lessons)
    return html`<div class="card ${path ? 'link' : ''}" role=${path ? 'link' : nothing} tabindex=${path ? '0' : nothing}
      aria-label=${path ? school.name : nothing}
      @click=${open} @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && open()}>
      ${head}
      ${this.renderMain(day.kind, lessons, range)}
      ${this.renderStrip(day.kind, lessons)}
      ${this.renderRows(day.kind, lessons)}
    </div>`
  }
}
