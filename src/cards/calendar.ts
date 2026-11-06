// The calendar page: month, week or day, switchable. Which calendars it shows is set in the dashboard's config only.
// The month shows each day's first events, a tap on a day opens it; week and day lay the hours out like a planner.
// On a phone the week becomes a list of the days with their events. A tap on an event shows its details.
import { css, html, nothing, type PropertyValues } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { entityName } from '../presentation'
import { tokens } from '../styles/tokens'
import {
  CALENDAR_COLORS, addDays, dayKey, eventsOn, layoutDay, sameDay, startOfDay, step, toEvent, viewDays,
  type ApiEvent, type CalEvent, type CalendarView,
} from '../calendar'

interface CalendarConfig extends BaseConfig {
  entities: string[]
  /** View on first open; afterwards each device keeps its own */
  view?: CalendarView
}

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
  }
  view: CalendarView = 'month'
  anchor = new Date()
  events: CalEvent[] = []
  selected?: CalEvent
  narrow = false
  /** Height left on screen below the bar, 0 until measured */
  fit = 0
  private loaded = new Map<string, number>()
  private all = new Map<string, CalEvent[]>()
  private resize?: ResizeObserver
  private onResize = () => this.measure()

  static styles = [tokens, css`
    :host { display: block; }
    .card { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 16px; }

    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .bar h2 { flex: 1; min-width: 0; margin: 0 0 0 8px; font-size: 20px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav { display: flex; align-items: center; gap: 4px; }
    .nav .btn { width: 36px; height: 36px; }
    .today-btn { all: unset; cursor: pointer; height: 36px; padding: 0 14px; border-radius: 18px; font-size: 13px; font-weight: 500; background: rgba(var(--ad-on-surface), 0.08); }
    .today-btn:focus-visible, .seg button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .seg { display: inline-flex; padding: 2px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.08); }
    .seg button { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 10px; font-size: 13px; opacity: 0.7; }
    .seg button[aria-pressed=true] { background: var(--ad-surface); opacity: 1; font-weight: 500; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); }


    /* Month: six weeks of days, each with its first events */
    .month { display: grid; grid-auto-rows: auto; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .wd { padding: 8px 4px; font-size: 12px; opacity: 0.55; text-align: center; }
    .cell {
      all: unset; box-sizing: border-box; min-height: var(--cell, 96px); padding: 4px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; min-width: 0;
      border-top: 1px solid rgba(var(--ad-on-surface), 0.08);
    }
    .cell:not(:nth-child(7n + 1)) { border-left: 1px solid rgba(var(--ad-on-surface), 0.05); }
    .cell:hover { background: rgba(var(--ad-on-surface), 0.03); }
    .cell:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .cell.other { opacity: 0.4; }
    .num { align-self: flex-start; min-width: 24px; height: 24px; display: grid; place-items: center; border-radius: 12px; font-size: 13px; font-variant-numeric: tabular-nums; }
    .cell.today .num { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); font-weight: 500; }
    .ev {
      all: unset; display: flex; align-items: center; gap: 4px; min-width: 0; padding: 1px 4px; border-radius: 4px; font-size: 12px; line-height: 16px; cursor: pointer;
    }
    .ev:focus-visible { outline: 2px solid rgb(var(--c)); }
    .events { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ev { max-width: 100%; box-sizing: border-box; overflow: hidden; }
    .ev .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .ev .h { opacity: 0.6; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
    .ev.all { background: rgba(var(--c), 0.22); }
    .ev:not(.all)::before { content: ''; flex: 0 0 6px; height: 6px; border-radius: 50%; background: rgb(var(--c)); }
    .day-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .more { font-size: 11px; opacity: 0.6; padding: 0 4px; white-space: nowrap; }

    /* Week and day: the hours like a planner */
    .grid { display: grid; grid-template-columns: 56px repeat(var(--days), minmax(0, 1fr)); }
    .head { padding: 4px; text-align: center; font-size: 12px; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .head button { all: unset; cursor: pointer; display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
    .head .wdn { opacity: 0.55; }
    .head .num { align-self: center; font-size: 16px; min-width: 30px; height: 30px; border-radius: 15px; }
    .head.today .num { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .alld { padding: 4px 2px; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); min-width: 0; }
    .alld-label { font-size: 11px; opacity: 0.5; padding: 6px 8px 6px 0; text-align: right; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .hours { position: relative; height: calc(var(--hours) * var(--hour)); }
    .gutter span { position: absolute; right: 8px; font-size: 11px; opacity: 0.5; transform: translateY(-50%); font-variant-numeric: tabular-nums; }
    .col { position: relative; border-left: 1px solid rgba(var(--ad-on-surface), 0.06);
      background: repeating-linear-gradient(to bottom, rgba(var(--ad-on-surface), 0.06) 0 1px, transparent 1px var(--hour)); }
    .slot {
      all: unset; box-sizing: border-box; position: absolute; padding: 2px 6px; border-radius: 6px; overflow: hidden; cursor: pointer;
      background: rgba(var(--c), 0.22); box-shadow: inset 3px 0 0 rgb(var(--c)); font-size: 12px; line-height: 16px;
    }
    .slot:focus-visible { outline: 2px solid rgb(var(--c)); }
    .slot b { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .slot span { opacity: 0.7; font-variant-numeric: tabular-nums; }
    .now { position: absolute; left: 0; right: 0; height: 2px; background: rgb(var(--ad-error)); pointer-events: none; }
    .now::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ad-error)); }

    /* Phone week: the days as a list */
    .agenda { display: flex; flex-direction: column; gap: 12px; }
    .aday { display: flex; flex-direction: column; gap: 4px; }
    .aday .dh { all: unset; cursor: pointer; font-size: 13px; opacity: 0.7; }
    .aday.today .dh { color: rgb(var(--ad-primary)); opacity: 1; font-weight: 500; }
    .aday .ev { font-size: 14px; line-height: 20px; padding: 4px 8px; }
    .empty { font-size: 13px; opacity: 0.5; padding: 4px 0; }

    /* An event's details over the bottom of the card */
    .detail {
      position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 2; display: flex; flex-direction: column; gap: 8px; padding: 16px;
      border-radius: 16px; background: var(--ad-surface); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08);
    }
    .detail .top { display: flex; align-items: flex-start; gap: 12px; }
    .detail h3 { flex: 1; margin: 0; font-size: 17px; font-weight: 500; }
    .detail .line { display: flex; align-items: center; gap: 8px; font-size: 13px; opacity: 0.8; }
    .detail .line i { width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--c)); }
    .detail .line ha-icon { --mdc-icon-size: 16px; opacity: 0.6; }
    .detail p { margin: 0; font-size: 13px; opacity: 0.75; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }

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
      @click=${(ev: Event) => { ev.stopPropagation(); this.selected = e }}>
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
        ${days.map(d => html`<div class="alld">${eventsOn(this.events, d).filter(e => e.allDay).map(e => this.evButton(e, d))}</div>`)}
      </div>
      <div class="fit">
        <div class="grid hours" style="--days:${days.length};--hours:${hours};--hour:${px}px">
          <div class="gutter" style="position:relative">${Array.from({ length: hours - 1 }, (_, i) => html`<span style="top:${(i + 1) * px}px">${String(from + i + 1).padStart(2, '0')}:00</span>`)}</div>
          ${days.map(d => html`<div class="col">
            ${layoutDay(this.events, d).map(p => html`<button class="slot" style="--c:${this.color(p.event.calendar)};top:${y(p.top)}px;height:${Math.max(p.height / 60 * px - 2, 16)}px;left:calc(${(p.column / p.columns) * 100}% + 2px);width:calc(${100 / p.columns}% - 4px)"
              @click=${() => (this.selected = p.event)}>
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
    </div>`
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
        <div class="seg" role="group">${views.map(([v, label]) => html`<button aria-pressed=${this.view === v} @click=${() => this.setView(v)}>${label}</button>`)}</div>
      </div>
      ${body}
      ${this.selected ? this.renderDetail(this.selected) : nothing}
    </div>`
  }
}
