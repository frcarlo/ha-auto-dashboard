// The calendar page: month, week or day, switchable. Which calendars it shows is set in the dashboard's config only.
// The month shows each day's first events, a tap on a day opens it; week and day lay the hours out like a planner.
// On a phone the week becomes a list of the days with their events. A tap on an event shows its details.
// Where a calendar allows it, events can be added (the + in the bar, or a tap on a free hour), changed and deleted.
import { css, html, nothing, type PropertyValues } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { entityName } from '../presentation'
import { tokens } from '../styles/tokens'
import {
  CALENDAR_COLORS, CAL_CREATE, CAL_DELETE, CAL_UPDATE, addDays, dayKey, draftOf, draftPayload, eventsOn, layoutDay, moveStart, newDraft,
  sameDay, startOfDay, step, toEvent, viewDays,
  type ApiEvent, type CalEvent, type CalendarView, type EventDraft,
} from '../calendar'

interface CalendarConfig extends BaseConfig {
  entities: string[]
  /** View on first open; afterwards each device keeps its own */
  view?: CalendarView
  /** false: only look, no adding, changing or deleting */
  edit?: boolean
}

type Scope = 'one' | 'following'

/** Pixels per hour in week and day until the card knows its room, and the bounds when it does */
const HOUR = 48
const HOUR_MIN = 28
const HOUR_MAX = 64
/** The hours week and day always show; earlier or later events widen them */
const DAY_FROM = 7
const DAY_TO = 21
/** Events load again after this long */
const STALE_MS = 10 * 60_000
/** Below this width the week becomes a list */
const NARROW = 640
const MONTH_LINES = 3

const store = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* private mode */ } },
}

export class AdCalendar extends BaseCard<CalendarConfig> {
  static properties = {
    ...BaseCard.properties,
    view: { state: true }, anchor: { state: true }, events: { state: true },
    selected: { state: true }, narrow: { state: true }, fit: { state: true },
    draft: { state: true }, scope: { state: true }, confirming: { state: true }, busy: { state: true }, error: { state: true },
  }
  view: CalendarView = 'month'
  anchor = new Date()
  events: CalEvent[] = []
  selected?: CalEvent
  narrow = false
  /** Height left on screen below the bar, 0 until measured */
  fit = 0
  /** The event in the form, new or being changed */
  draft?: EventDraft
  /** The event the form changes; none for a new one */
  private editing?: CalEvent
  /** For a series: change or delete just this one, or this and the following */
  scope: Scope = 'one'
  confirming = false
  busy = false
  error?: string
  private loaded = new Map<string, number>()
  private all = new Map<string, CalEvent[]>()
  private resize?: ResizeObserver
  private onResize = () => this.measure()

  static styles = [tokens, css`
    :host { display: block; }
    .card { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 16px; }

    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .bar h2 { flex: 1; min-width: 0; margin: 0 0 0 8px; font-size: var(--ad-fs-l); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav { display: flex; align-items: center; gap: 4px; }
    .nav .btn { width: 36px; height: 36px; }
    .today-btn { all: unset; cursor: pointer; height: 36px; padding: 0 14px; border-radius: 18px; font-size: var(--ad-fs-s); font-weight: 500; background: rgba(var(--ad-on-surface), 0.08); }
    .today-btn:focus-visible, .seg button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .seg { display: inline-flex; padding: 2px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.08); }
    .seg button { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 10px; font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .seg button[aria-pressed=true] { background: var(--ad-surface); opacity: 1; font-weight: 500; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); }


    /* Month: six weeks of days, each with its first events */
    .month { display: grid; grid-auto-rows: auto; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .wd { padding: 8px 4px; font-size: var(--ad-fs-s); opacity: var(--ad-o2); text-align: center; }
    .cell {
      all: unset; box-sizing: border-box; min-height: var(--cell, 96px); padding: 4px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; min-width: 0;
      border-top: 1px solid rgba(var(--ad-on-surface), 0.08);
    }
    .cell:not(:nth-child(7n + 1)) { border-left: 1px solid rgba(var(--ad-on-surface), 0.05); }
    .cell:hover { background: rgba(var(--ad-on-surface), 0.03); }
    .cell:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .cell.other { opacity: 0.4; }
    .num { align-self: flex-start; min-width: 24px; height: 24px; display: grid; place-items: center; border-radius: 12px; font-size: var(--ad-fs-s); font-variant-numeric: tabular-nums; }
    .cell.today .num { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); font-weight: 500; }
    .ev {
      all: unset; display: flex; align-items: center; gap: 4px; min-width: 0; padding: 1px 4px; border-radius: 4px; font-size: var(--ad-fs-s); line-height: 16px; cursor: pointer;
    }
    .ev:focus-visible { outline: 2px solid rgb(var(--c)); }
    .events { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ev { max-width: 100%; box-sizing: border-box; overflow: hidden; }
    .ev .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .ev .h { opacity: var(--ad-o2); font-variant-numeric: tabular-nums; flex: 0 0 auto; }
    .ev.all { background: rgba(var(--c), 0.22); }
    .ev:not(.all)::before { content: ''; flex: 0 0 6px; height: 6px; border-radius: 50%; background: rgb(var(--c)); }
    .day-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .more { font-size: var(--ad-fs-xs); opacity: var(--ad-o2); padding: 0 4px; white-space: nowrap; }

    /* Week and day: the hours like a planner */
    .grid { display: grid; grid-template-columns: 56px repeat(var(--days), minmax(0, 1fr)); }
    .head { padding: 4px; text-align: center; font-size: var(--ad-fs-s); border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .head button { all: unset; cursor: pointer; display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
    .head .wdn { opacity: var(--ad-o2); }
    .head .num { align-self: center; font-size: var(--ad-fs-m); min-width: 30px; height: 30px; border-radius: 15px; }
    .head.today .num { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .alld { padding: 4px 2px; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); min-width: 0; }
    .alld-label { font-size: var(--ad-fs-xs); opacity: var(--ad-o3); padding: 6px 8px 6px 0; text-align: right; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .hours { position: relative; height: calc(var(--hours) * var(--hour)); }
    .gutter span { position: absolute; right: 8px; font-size: var(--ad-fs-xs); opacity: var(--ad-o3); transform: translateY(-50%); font-variant-numeric: tabular-nums; }
    .col { position: relative; border-left: 1px solid rgba(var(--ad-on-surface), 0.06);
      background: repeating-linear-gradient(to bottom, rgba(var(--ad-on-surface), 0.06) 0 1px, transparent 1px var(--hour)); }
    .slot {
      all: unset; box-sizing: border-box; position: absolute; padding: 2px 6px; border-radius: 6px; overflow: hidden; cursor: pointer;
      background: rgba(var(--c), 0.22); box-shadow: inset 3px 0 0 rgb(var(--c)); font-size: var(--ad-fs-s); line-height: 16px;
    }
    .slot:focus-visible { outline: 2px solid rgb(var(--c)); }
    .slot b { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .slot span { opacity: var(--ad-o2); font-variant-numeric: tabular-nums; }
    .now { position: absolute; left: 0; right: 0; height: 2px; background: rgb(var(--ad-error)); pointer-events: none; }
    .now::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ad-error)); }

    /* Phone week: the days as a list */
    .agenda { display: flex; flex-direction: column; gap: 12px; }
    .aday { display: flex; flex-direction: column; gap: 4px; }
    .aday .dh { all: unset; cursor: pointer; font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .aday.today .dh { color: rgb(var(--ad-primary)); opacity: 1; font-weight: 500; }
    .aday .ev { font-size: var(--ad-fs-m); line-height: 20px; padding: 4px 8px; }
    .empty { font-size: var(--ad-fs-s); opacity: var(--ad-o3); padding: 4px 0; }

    /* An event's details over the bottom of the card */
    .detail {
      position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 2; display: flex; flex-direction: column; gap: 8px; padding: 16px;
      border-radius: 16px; background: var(--ad-surface); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08);
    }
    .detail .top { display: flex; align-items: flex-start; gap: 12px; }
    .detail h3 { flex: 1; margin: 0; font-size: var(--ad-fs-l); font-weight: 500; }
    .detail .line { display: flex; align-items: center; gap: 8px; font-size: var(--ad-fs-s); opacity: 0.8; }
    .detail .line i { width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--c)); }
    .detail .line ha-icon { --mdc-icon-size: 16px; opacity: var(--ad-o2); }
    .detail p { margin: 0; font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }

    .detail .actions, .form .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .detail .confirm { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--ad-fs-m); }
    .act {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px; border-radius: 18px;
      font-size: var(--ad-fs-s); font-weight: 500; background: rgba(var(--ad-on-surface), 0.08);
    }
    .act ha-icon { --mdc-icon-size: 18px; }
    .act:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .act.primary { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .act.danger { background: rgba(var(--ad-error), 0.16); color: rgb(var(--ad-error)); }
    .act[disabled] { opacity: 0.5; pointer-events: none; }
    .error { margin: 0; font-size: var(--ad-fs-s); color: rgb(var(--ad-error)); }
    .add ha-icon { --mdc-icon-size: 20px; }
    :host([editable]) .col, :host([editable]) .alld { cursor: cell; }

    /* The form for a new or changed event, over the whole page */
    :host([dark]) { color-scheme: dark; }
    dialog.form {
      border: none; padding: 0; border-radius: 20px; width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); box-sizing: border-box;
      background: var(--ad-surface); color: rgb(var(--ad-on-surface)); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
    }
    dialog.form::backdrop { background: rgba(0, 0, 0, 0.45); }
    .form form { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
    .form h3 { margin: 0 0 4px; font-size: var(--ad-fs-l); font-weight: 500; }
    .form input:not([type=checkbox]), .form select, .form textarea {
      box-sizing: border-box; width: 100%; min-width: 0; padding: 10px 12px; border: none; border-radius: 10px; font: inherit; font-size: var(--ad-fs-m); line-height: 20px;
      color: inherit; background: rgba(var(--ad-on-surface), 0.06);
    }
    .form input:focus-visible, .form select:focus-visible, .form textarea:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 0; }
    .form .name { font-size: var(--ad-fs-l); }
    .form textarea { resize: vertical; }
    .form .row { display: grid; grid-template-columns: 64px minmax(0, 1fr) 112px; align-items: center; gap: 8px; font-size: var(--ad-fs-s); }
    .form .row.dates { grid-template-columns: 64px minmax(0, 1fr); }
    .form .row > span { opacity: var(--ad-o2); }
    .form .switch { display: flex; align-items: center; gap: 8px; font-size: var(--ad-fs-m); cursor: pointer; }
    .form .switch input { width: 18px; height: 18px; margin: 0; accent-color: rgb(var(--ad-primary)); }
    .form .seg { align-self: flex-start; }

    /* Narrow month: dots instead of titles */
    :host([narrow]) .cell { min-height: 52px; align-items: center; }
    :host([narrow]) .cell .ev { padding: 0; }
    :host([narrow]) .cell .ev .t, :host([narrow]) .cell .ev .h, :host([narrow]) .more { display: none; }
    :host([narrow]) .cell .ev.all { width: 6px; height: 6px; border-radius: 50%; background: rgb(var(--c)); }
    :host([narrow]) .cell .events { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
    :host([narrow]) .bar h2 { flex-basis: 100%; order: -1; margin: 0; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 10
  }

  setConfig(config: CalendarConfig) {
    super.setConfig(config)
    const saved = store.get('ad-calendar-view') as CalendarView | null
    this.view = saved && ['month', 'week', 'day'].includes(saved) ? saved : config.view ?? 'month'
  }

  connectedCallback() {
    super.connectedCallback()
    this.resize = new ResizeObserver(([entry]) => {
      const narrow = (entry?.contentRect.width ?? 1000) < NARROW
      if (narrow !== this.narrow) { this.narrow = narrow; this.toggleAttribute('narrow', narrow) }
      this.measure()
    })
    this.resize.observe(this)
    window.addEventListener('resize', this.onResize)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.resize?.disconnect()
    window.removeEventListener('resize', this.onResize)
  }

  /** How much of the screen is left below the bar, so month and hours fit without scrolling. */
  private measure() {
    const body = this.renderRoot.querySelector<HTMLElement>('.fit')
    const rect = body?.getBoundingClientRect()
    // Not on screen yet, like a page that is not open
    if (!rect || !rect.width) return
    const fit = Math.floor(window.innerHeight - rect.top - 24)
    if (Math.abs(fit - this.fit) > 4) this.fit = fit
  }

  /** The hours week and day show: the working day, widened to the events and to now. */
  private hourRange(days: Date[]): [number, number] {
    let from = DAY_FROM
    let to = DAY_TO
    for (const d of days) for (const p of layoutDay(this.events, d)) {
      from = Math.min(from, Math.floor(p.top / 60))
      to = Math.max(to, Math.ceil((p.top + p.height) / 60))
    }
    const now = new Date()
    if (days.some(d => sameDay(d, now))) { from = Math.min(from, now.getHours()); to = Math.max(to, now.getHours() + 1) }
    return [Math.max(0, from), Math.min(24, to)]
  }

  protected watched() {
    return this.config!.entities
  }

  /** What HA lets this calendar do, if the dashboard allows changes at all */
  private can(id: string, feature: number) {
    if (this.config!.edit === false || !this.hass?.callWS || !this.canControl(id)) return false
    return (Number(this.hass.states[id]?.attributes.supported_features ?? 0) & feature) !== 0
  }

  private get creatable() {
    return this.config!.entities.filter(id => this.can(id, CAL_CREATE))
  }

  private get locale() {
    return this.hass!.locale?.language ?? this.hass!.language
  }

  /** Monday unless HA's locale says otherwise */
  private get firstDay() {
    const first = (this.hass?.locale as { first_weekday?: string } | undefined)?.first_weekday
    return first === 'sunday' ? 0 : first === 'saturday' ? 6 : 1
  }

  private color(id: string) {
    return CALENDAR_COLORS[Math.max(0, this.config!.entities.indexOf(id)) % CALENDAR_COLORS.length]!
  }

  private get days() {
    return viewDays(this.view, this.anchor, this.firstDay)
  }

  /** Loads the shown range from every configured calendar, unless it is fresh. */
  private async load() {
    const days = this.days
    const from = days[0]!
    const to = addDays(days[days.length - 1]!, 1)
    const key = `${dayKey(from)}|${dayKey(to)}`
    if (Date.now() - (this.loaded.get(key) ?? 0) < STALE_MS) return this.collect(key)
    this.loaded.set(key, Date.now())
    const api = this.hass?.callApi
    if (!api) return
    const lists = await Promise.all(this.config!.entities.map(id =>
      api<ApiEvent[]>('GET', `calendars/${id}?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`)
        .then(list => list.map((e, i) => toEvent(id, e, i)).filter((e): e is CalEvent => !!e))
        .catch(() => [] as CalEvent[])))
    this.all.set(key, lists.flat())
    this.collect(key)
  }

  private collect(key: string) {
    this.events = this.all.get(key) ?? []
  }

  protected updated(changed: PropertyValues<this>) {
    this.toggleAttribute('editable', this.creatable.length > 0)
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog.form')
    if (dialog && !dialog.open) dialog.showModal()
    // A new range or a change in a calendar (an event starts or ends) loads again, unless what is there is fresh
    if ((['view', 'anchor', 'config', 'hass'] as const).some(k => changed.has(k))) void this.load()
    // All-day events push the hours down, so measure again when they change
    if (changed.has('view') || changed.has('narrow') || changed.has('events')) this.measure()
  }

  private setView(view: CalendarView) {
    this.view = view
    store.set('ad-calendar-view', view)
  }

  private openDay(day: Date) {
    this.anchor = day
    this.setView('day')
  }

  private show(e: CalEvent) {
    this.selected = e
    this.confirming = false
    this.error = undefined
  }

  /** The form for a new event: the calendar used last, an hour from the start */
  private startNew(start: Date, allDay = false) {
    const creatable = this.creatable
    if (!creatable.length) return
    const last = store.get('ad-calendar-last')
    this.selected = undefined
    this.editing = undefined
    this.error = undefined
    this.draft = newDraft(last && creatable.includes(last) ? last : creatable[0]!, start, allDay)
  }

  /** New from the bar: the next full hour when today is shown, else nine on the day shown */
  private startNewFromBar() {
    const now = new Date()
    const start = this.days.some(d => sameDay(d, now)) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1) : new Date(startOfDay(this.anchor).getTime() + 9 * 3_600_000)
    this.startNew(start)
  }

  private startEdit(e: CalEvent) {
    this.editing = e
    this.scope = 'one'
    this.error = undefined
    this.draft = draftOf(e)
  }

  private closeForm() {
    this.draft = undefined
    this.editing = undefined
    this.error = undefined
  }

  /** Which occurrence of a series a change or delete means */
  private occurrence(e: CalEvent, scope: Scope) {
    return e.recurrenceId ? { recurrence_id: e.recurrenceId, ...(scope === 'following' ? { recurrence_range: 'THISANDFUTURE' } : {}) } : {}
  }

  private failed(err: unknown) {
    const msg = (err as { message?: string } | undefined)?.message ?? String(err)
    this.error = t(this.hass, 'cal.failed', { msg })
  }

  private async save() {
    const d = this.draft
    if (!d || this.busy) return
    const result = draftPayload(d)
    if ('error' in result) {
      this.error = t(this.hass, result.error === 'title' ? 'cal.need_title' : 'cal.end_before')
      return
    }
    this.busy = true
    try {
      const e = this.editing
      if (e) await this.hass!.callWS!({ type: 'calendar/event/update', entity_id: e.calendar, uid: e.uid, ...this.occurrence(e, this.scope), event: result.event })
      else {
        await this.hass!.callWS!({ type: 'calendar/event/create', entity_id: d.calendar, event: result.event })
        store.set('ad-calendar-last', d.calendar)
      }
      this.selected = undefined
      this.closeForm()
      this.refresh()
    } catch (err) {
      this.failed(err)
    } finally {
      this.busy = false
    }
  }

  private async deleteEvent(e: CalEvent, scope: Scope) {
    if (this.busy) return
    this.busy = true
    try {
      await this.hass!.callWS!({ type: 'calendar/event/delete', entity_id: e.calendar, uid: e.uid, ...this.occurrence(e, scope) })
      this.selected = undefined
      this.confirming = false
      this.refresh()
    } catch (err) {
      this.failed(err)
    } finally {
      this.busy = false
    }
  }

  /** After a change everything loads again, other ranges too */
  private refresh() {
    this.loaded.clear()
    this.all.clear()
    void this.load()
  }

  /** A tap on a free spot of a day: a new event at that half hour */
  private tapHours(ev: MouseEvent, day: Date, from: number, px: number) {
    if (ev.target !== ev.currentTarget) return
    const minutes = Math.floor((ev.offsetY / px + from) * 2) * 30
    this.startNew(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes))
  }

  private time(d: Date) {
    return d.toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit' })
  }

  private heading() {
    const days = this.days
    if (this.view === 'month') return this.anchor.toLocaleDateString(this.locale, { month: 'long', year: 'numeric' })
    if (this.view === 'day') return this.anchor.toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long' })
    const first = days[0]!
    const last = days[6]!
    const sameMonth = first.getMonth() === last.getMonth()
    return `${first.toLocaleDateString(this.locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(this.locale, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }

  private evButton(e: CalEvent, day: Date, withTime = true) {
    const starts = !e.allDay && sameDay(e.start, day)
    return html`<button class="ev ${e.allDay ? 'all' : ''}" style="--c:${this.color(e.calendar)}" title=${e.title}
      @click=${(ev: Event) => { ev.stopPropagation(); this.show(e) }}>
      ${withTime && starts ? html`<span class="h">${this.time(e.start)}</span>` : nothing}<span class="t">${e.title}</span>
    </button>`
  }

  private renderMonth() {
    const today = new Date()
    const days = this.days
    const month = this.anchor.getMonth()
    // The weeks share the height left on screen; a taller cell shows more events
    const cell = this.fit && !this.narrow ? Math.min(160, Math.max(72, Math.floor((this.fit - 32) / (days.length / 7)))) : undefined
    // Padding and day number take 34px, each event line 20px
    const lines = this.narrow ? 4 : cell ? Math.max(1, Math.floor((cell - 34) / 20)) : MONTH_LINES
    return html`<div class="month fit" style=${cell ? `--cell:${cell}px` : ''}>
      ${days.slice(0, 7).map(d => html`<span class="wd">${d.toLocaleDateString(this.locale, { weekday: this.narrow ? 'narrow' : 'short' })}</span>`)}
      ${days.map(d => {
        const list = eventsOn(this.events, d)
        return html`<div class="cell ${d.getMonth() !== month ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''}" role="button" tabindex="0"
          aria-label=${d.toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          @click=${() => this.openDay(d)} @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.openDay(d)}>
          <div class="day-top"><span class="num">${d.getDate()}</span>
            ${list.length > lines ? html`<span class="more">${t(this.hass, 'cal.more', { n: list.length - lines })}</span>` : nothing}</div>
          <div class="events">${list.slice(0, lines).map(e => this.evButton(e, d))}</div>
        </div>`
      })}
    </div>`
  }

  private renderHours() {
    const today = new Date()
    const days = this.days
    const [from, to] = this.hourRange(days)
    const hours = to - from
    // The hours share the height left on screen; below the smallest step the page grows instead of a box that scrolls
    const px = this.fit ? Math.min(HOUR_MAX, Math.max(HOUR_MIN, Math.floor(this.fit / hours))) : HOUR
    const y = (minutes: number) => (minutes / 60 - from) * px
    const nowMin = today.getHours() * 60 + today.getMinutes()
    return html`
      <div class="grid" style="--days:${days.length}">
        <span></span>
        ${days.map(d => html`<div class="head ${sameDay(d, today) ? 'today' : ''}">
          <button @click=${() => this.openDay(d)}><span class="wdn">${d.toLocaleDateString(this.locale, { weekday: 'short' })}</span><span class="num">${d.getDate()}</span></button>
        </div>`)}
        <span class="alld-label">${t(this.hass, 'cal.all_day')}</span>
        ${days.map(d => html`<div class="alld" @click=${(ev: Event) => ev.target === ev.currentTarget && this.startNew(d, true)}>${eventsOn(this.events, d).filter(e => e.allDay).map(e => this.evButton(e, d))}</div>`)}
      </div>
      <div class="fit">
        <div class="grid hours" style="--days:${days.length};--hours:${hours};--hour:${px}px">
          <div class="gutter" style="position:relative">${Array.from({ length: hours - 1 }, (_, i) => html`<span style="top:${(i + 1) * px}px">${String(from + i + 1).padStart(2, '0')}:00</span>`)}</div>
          ${days.map(d => html`<div class="col" @click=${(ev: MouseEvent) => this.tapHours(ev, d, from, px)}>
            ${layoutDay(this.events, d).map(p => html`<button class="slot" style="--c:${this.color(p.event.calendar)};top:${y(p.top)}px;height:${Math.max(p.height / 60 * px - 2, 16)}px;left:calc(${(p.column / p.columns) * 100}% + 2px);width:calc(${100 / p.columns}% - 4px)"
              @click=${() => this.show(p.event)}>
              <b>${p.event.title}</b>${p.height / 60 * px >= 34 ? html`<span>${this.time(p.event.start)} – ${this.time(p.event.end)}</span>` : nothing}
            </button>`)}
            ${sameDay(d, today) ? html`<span class="now" style="top:${y(nowMin)}px"></span>` : nothing}
          </div>`)}
        </div>
      </div>`
  }

  private renderAgenda() {
    const today = new Date()
    return html`<div class="agenda">${this.days.map(d => {
      const list = eventsOn(this.events, d)
      return html`<div class="aday ${sameDay(d, today) ? 'today' : ''}">
        <button class="dh" @click=${() => this.openDay(d)}>${d.toLocaleDateString(this.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</button>
        ${list.length ? list.map(e => this.evButton(e, d)) : html`<span class="empty">${t(this.hass, 'cal.empty')}</span>`}
      </div>`
    })}</div>`
  }

  private renderDetail(e: CalEvent) {
    const sameDate = sameDay(e.start, addDays(e.end, e.allDay ? -1 : 0))
    const date = (d: Date) => d.toLocaleDateString(this.locale, { weekday: 'short', day: 'numeric', month: 'long' })
    const when = e.allDay
      ? sameDate ? `${date(e.start)}, ${t(this.hass, 'cal.all_day')}` : `${date(e.start)} – ${date(addDays(e.end, -1))}`
      : sameDate ? `${date(e.start)}, ${this.time(e.start)} – ${this.time(e.end)}` : `${date(e.start)} ${this.time(e.start)} – ${date(e.end)} ${this.time(e.end)}`
    const cal = this.hass!.states[e.calendar]
    return html`<div class="detail" role="dialog" aria-label=${e.title} style="--c:${this.color(e.calendar)}" @keydown=${(ev: KeyboardEvent) => ev.key === 'Escape' && (this.selected = undefined)}>
      <div class="top">
        <h3>${e.title}</h3>
        <button class="btn" aria-label=${t(this.hass, 'cal.close')} @click=${() => (this.selected = undefined)}><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <span class="line"><ha-icon icon="mdi:clock-outline"></ha-icon>${when}</span>
      <span class="line"><i></i>${cal ? entityName(cal) : e.calendar}</span>
      ${e.location ? html`<span class="line"><ha-icon icon="mdi:map-marker-outline"></ha-icon>${e.location}</span>` : nothing}
      ${e.description ? html`<p>${e.description}</p>` : nothing}
      ${this.renderActions(e)}
    </div>`
  }

  /** Change and delete under the details, where the calendar allows them; delete asks first */
  private renderActions(e: CalEvent) {
    const update = !!e.uid && this.can(e.calendar, CAL_UPDATE)
    const remove = !!e.uid && this.can(e.calendar, CAL_DELETE)
    if (!update && !remove) return nothing
    const error = this.error ? html`<p class="error">${this.error}</p>` : nothing
    if (this.confirming) {
      const series = !!e.recurrenceId
      return html`${error}<div class="confirm">
        <span>${t(this.hass, series ? 'cal.confirm_delete_series' : 'cal.confirm_delete')}</span>
        <div class="actions">
          <button class="act" @click=${() => (this.confirming = false)}>${t(this.hass, 'cal.cancel')}</button>
          ${series ? html`<button class="act danger" ?disabled=${this.busy} @click=${() => this.deleteEvent(e, 'following')}>${t(this.hass, 'cal.this_and_following')}</button>` : nothing}
          <button class="act danger" ?disabled=${this.busy} @click=${() => this.deleteEvent(e, 'one')}>${t(this.hass, series ? 'cal.only_this' : 'cal.delete')}</button>
        </div>
      </div>`
    }
    return html`${error}<div class="actions">
      ${remove ? html`<button class="act" @click=${() => (this.confirming = true)}><ha-icon icon="mdi:delete-outline"></ha-icon>${t(this.hass, 'cal.delete')}</button>` : nothing}
      ${update ? html`<button class="act" @click=${() => this.startEdit(e)}><ha-icon icon="mdi:pencil-outline"></ha-icon>${t(this.hass, 'cal.edit')}</button>` : nothing}
    </div>`
  }

  private renderForm(d: EventDraft) {
    const hass = this.hass!
    const e = this.editing
    const set = (patch: Partial<EventDraft>) => (this.draft = { ...this.draft!, ...patch })
    const value = (ev: Event) => (ev.target as HTMLInputElement).value
    const calendars = e ? [e.calendar] : this.creatable
    const name = (id: string) => { const s = hass.states[id]; return s ? entityName(s) : id }
    return html`<dialog class="form" aria-label=${t(hass, e ? 'cal.edit_title' : 'cal.new')}
      @cancel=${(ev: Event) => { ev.preventDefault(); this.closeForm() }}
      @click=${(ev: Event) => ev.target === ev.currentTarget && this.closeForm()}>
      <form @submit=${(ev: Event) => { ev.preventDefault(); void this.save() }}>
        <h3>${t(hass, e ? 'cal.edit_title' : 'cal.new')}</h3>
        <input class="name" placeholder=${t(hass, 'cal.title')} aria-label=${t(hass, 'cal.title')} .value=${d.title} autofocus @input=${(ev: Event) => set({ title: value(ev) })}>
        <label class="row dates"><span>${t(hass, 'calendar')}</span>
          <select ?disabled=${!!e} @change=${(ev: Event) => set({ calendar: value(ev) })}>
            ${calendars.map(id => html`<option value=${id} ?selected=${id === d.calendar}>${name(id)}</option>`)}
          </select>
        </label>
        <label class="switch"><input type="checkbox" .checked=${d.allDay} @change=${(ev: Event) => {
          const allDay = (ev.target as HTMLInputElement).checked
          set({ allDay, ...(d.endDate < d.startDate ? { endDate: d.startDate } : {}) })
        }}>${t(hass, 'cal.all_day')}</label>
        <div class="row ${d.allDay ? 'dates' : ''}"><span>${t(hass, 'cal.start')}</span>
          <input type="date" aria-label=${t(hass, 'cal.start')} .value=${d.startDate} required @change=${(ev: Event) => value(ev) && (this.draft = moveStart(d, value(ev), d.startTime))}>
          ${d.allDay ? nothing : html`<input type="time" aria-label=${t(hass, 'cal.start')} .value=${d.startTime} required @change=${(ev: Event) => value(ev) && (this.draft = moveStart(d, d.startDate, value(ev)))}>`}
        </div>
        <div class="row ${d.allDay ? 'dates' : ''}"><span>${t(hass, 'cal.end')}</span>
          <input type="date" aria-label=${t(hass, 'cal.end')} .value=${d.endDate} required @change=${(ev: Event) => value(ev) && set({ endDate: value(ev) })}>
          ${d.allDay ? nothing : html`<input type="time" aria-label=${t(hass, 'cal.end')} .value=${d.endTime} required @change=${(ev: Event) => value(ev) && set({ endTime: value(ev) })}>`}
        </div>
        <input placeholder=${t(hass, 'cal.location')} aria-label=${t(hass, 'cal.location')} .value=${d.location} @input=${(ev: Event) => set({ location: value(ev) })}>
        <textarea rows="3" placeholder=${t(hass, 'cal.description')} aria-label=${t(hass, 'cal.description')} .value=${d.description} @input=${(ev: Event) => set({ description: value(ev) })}></textarea>
        ${e?.recurrenceId ? html`<div class="seg" role="group">
          ${(['one', 'following'] as const).map(s => html`<button type="button" aria-pressed=${this.scope === s} @click=${() => (this.scope = s)}>${t(hass, s === 'one' ? 'cal.only_this' : 'cal.this_and_following')}</button>`)}
        </div>` : nothing}
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        <div class="actions">
          <button type="button" class="act" @click=${() => this.closeForm()}>${t(hass, 'cal.cancel')}</button>
          <button type="submit" class="act primary" ?disabled=${this.busy}>${t(hass, 'cal.save')}</button>
        </div>
      </form>
    </dialog>`
  }

  protected render() {
    const views: [CalendarView, string][] = [['month', t(this.hass, 'cal.month')], ['week', t(this.hass, 'cal.week')], ['day', t(this.hass, 'cal.day')]]
    const body = this.view === 'month' ? this.renderMonth() : this.view === 'week' && this.narrow ? this.renderAgenda() : this.renderHours()
    return html`<div class="card">
      <div class="bar">
        <div class="nav">
          <button class="btn" aria-label=${t(this.hass, 'cal.prev')} @click=${() => (this.anchor = step(this.view, this.anchor, -1))}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <button class="today-btn" @click=${() => (this.anchor = startOfDay(new Date()))}>${t(this.hass, 'today')}</button>
          <button class="btn" aria-label=${t(this.hass, 'cal.next')} @click=${() => (this.anchor = step(this.view, this.anchor, 1))}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        </div>
        <h2>${this.heading()}</h2>
        ${this.creatable.length ? html`<button class="btn add" aria-label=${t(this.hass, 'cal.new')} title=${t(this.hass, 'cal.new')} @click=${() => this.startNewFromBar()}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
        <div class="seg" role="group">${views.map(([v, label]) => html`<button aria-pressed=${this.view === v} @click=${() => this.setView(v)}>${label}</button>`)}</div>
      </div>
      ${body}
      ${this.selected ? this.renderDetail(this.selected) : nothing}
      ${this.draft ? this.renderForm(this.draft) : nothing}
    </div>`
  }
}
