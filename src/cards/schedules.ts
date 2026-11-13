// The heating plans on the climate page: HA's schedule helpers, each as a week of seven bars with the times it is
// on. Admins tap a day to change it: the blocks of that day as times, and the days the same blocks should go to.
// Saving writes the helper back to HA; whatever runs on the schedule (an automation switching the thermostats)
// follows by itself. While a day is open, the bars show what saving would do.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { entityName } from '../presentation'
import {
  DAYS, DAY_MINUTES, blocksOf, checkBlocks, dayOf, loadSchedules, parseTime, scheduleStatus, shortTime, updateMessage, withBlocks,
  type Block, type Day, type ScheduleItem,
} from '../schedules'
import { tokens } from '../styles/tokens'

interface SchedulesConfig extends BaseConfig {
  entities: string[]
}

interface Draft {
  entity: string
  /** The day that was tapped */
  day: Day
  blocks: Block[]
  /** Days the blocks go to on saving */
  days: Day[]
  busy?: boolean
  error?: string
}

const WORKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const WEEKEND: Day[] = ['saturday', 'sunday']
/** A Monday, to name the days in the user's language */
const MONDAY = new Date(2024, 0, 1)
const sameDays = (a: Day[], b: Day[]) => a.length === b.length && a.every(d => b.includes(d))

export class AdSchedules extends BaseCard<SchedulesConfig> {
  static properties = {
    ...BaseCard.properties,
    items: { state: true },
    failed: { state: true },
    draft: { state: true },
  }

  /** The stored helpers by entity; undefined until loaded */
  items?: Map<string, ScheduleItem>
  failed = false
  draft?: Draft
  private loading = false
  private minuteTimer?: number

  static styles = [tokens, css`
    :host { display: block; }
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 16px; align-items: start; }
    .plan { height: auto; padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 10px; container-type: inline-size; }

    .head { display: flex; align-items: center; gap: 10px; min-height: 32px; }
    .head .dot { width: 32px; height: 32px; flex-basis: 32px; }
    .head .dot.on { background: rgba(var(--ad-warning), 0.18); color: rgb(var(--ad-warning)); }
    .title { all: unset; cursor: pointer; min-width: 0; font-size: var(--ad-fs-m); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state { margin-left: auto; font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .state.on { opacity: 1; color: rgb(var(--ad-warning)); }

    .week { display: flex; flex-direction: column; gap: 2px; }
    .day {
      all: unset; box-sizing: border-box; display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px;
      padding: 4px 6px; margin: 0 -6px; border-radius: 10px;
    }
    button.day { cursor: pointer; }
    button.day:hover { background: rgba(var(--ad-on-surface), 0.05); }
    .day:focus-visible, .title:focus-visible, .chip:focus-visible, .text:focus-visible, .solid:focus-visible, input:focus-visible {
      outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px;
    }
    .day.open { background: rgba(var(--ad-primary), 0.1); }
    .day .d { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .day.today .d { opacity: 1; font-weight: 600; color: rgb(var(--ad-primary)); }
    .bar { position: relative; height: 16px; border-radius: 5px; background: rgba(var(--ad-on-surface), 0.07); }
    .bar .on { position: absolute; top: 0; bottom: 0; border-radius: 5px; background: rgba(var(--ad-warning), 0.8); }
    /* Not saved yet: the blocks the open day would put here */
    .day.draft .bar .on { background: repeating-linear-gradient(135deg, rgba(var(--ad-warning), 0.85) 0 5px, rgba(var(--ad-warning), 0.45) 5px 10px); }
    .bar .now { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: rgb(var(--ad-on-surface)); }
    .day .times { font-size: var(--ad-fs-xs); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; text-align: right; min-width: 76px; line-height: 1.3; }
    .axis { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; font-size: var(--ad-fs-xs); opacity: var(--ad-o3); font-variant-numeric: tabular-nums; }
    .axis .ticks { display: flex; justify-content: space-between; }
    .axis .pad { min-width: 76px; }
    @container (max-width: 400px) {
      .day, .axis { grid-template-columns: 28px 1fr; }
      .day .times, .axis .pad { display: none; }
    }
    .note { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }

    /* The open day */
    .edit { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .edit h4 { margin: 0; font-size: var(--ad-fs-m); font-weight: 600; }
    .blocks { display: flex; flex-direction: column; gap: 8px; }
    .block { display: flex; align-items: center; gap: 8px; font-size: var(--ad-fs-s); }
    .block span { opacity: var(--ad-o2); }
    .block .btn { margin-left: auto; }
    input[type=time] {
      font: inherit; font-size: var(--ad-fs-m); font-variant-numeric: tabular-nums; color: inherit; color-scheme: light dark;
      padding: 6px 8px; border-radius: 10px; border: none; background: rgba(var(--ad-on-surface), 0.07);
    }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .row .k { font-size: var(--ad-fs-s); opacity: var(--ad-o2); margin-right: 4px; }
    .chip {
      all: unset; box-sizing: border-box; min-width: 36px; padding: 6px 8px; border-radius: 10px; text-align: center; cursor: pointer;
      font-size: var(--ad-fs-s); background: rgba(var(--ad-on-surface), 0.07);
    }
    .chip[aria-pressed=true] { background: rgba(var(--ad-primary), 0.22); box-shadow: inset 0 0 0 1.5px rgba(var(--ad-primary), 0.6); font-weight: 600; }
    .text {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 10px;
      font-size: var(--ad-fs-s); color: rgb(var(--ad-primary));
    }
    .text:hover { background: rgba(var(--ad-primary), 0.1); }
    .text ha-icon { --mdc-icon-size: 18px; }
    .actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .actions .error { margin-right: auto; font-size: var(--ad-fs-s); color: rgb(var(--ad-error)); }
    .solid {
      all: unset; cursor: pointer; padding: 8px 16px; border-radius: 12px; font-size: var(--ad-fs-s); font-weight: 600;
      background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary));
    }
    .solid[disabled] { opacity: 0.4; pointer-events: none; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 6
  }

  protected watched() {
    return this.config!.entities
  }

  connectedCallback() {
    super.connectedCallback()
    // The line for now moves along
    this.minuteTimer = window.setInterval(() => this.requestUpdate(), 60_000)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.minuteTimer)
  }

  protected updated() {
    if (this.items || this.loading || this.failed) return
    this.loading = true
    loadSchedules(this.hass!, this.config!.entities)
      .then(items => { this.items = items })
      .catch(() => { this.failed = true })
      .finally(() => { this.loading = false })
  }

  private get loc() {
    return this.hass!.locale?.language ?? this.hass!.language
  }

  private dayName(day: Day, style: 'short' | 'long') {
    const date = new Date(MONDAY)
    date.setDate(date.getDate() + DAYS.indexOf(day))
    return date.toLocaleDateString(this.loc, { weekday: style }).replace(/\.$/, '')
  }

  /** Admins change stored helpers; YAML ones and other users only look */
  private editable(entity: string) {
    return !!this.hass!.user?.is_admin && !!this.items?.has(entity)
  }

  private open(entity: string, day: Day) {
    const item = this.items!.get(entity)!
    if (this.draft?.entity === entity && this.draft.day === day) return this.close()
    this.draft = { entity, day, blocks: blocksOf(item, day), days: [day] }
  }

  private close() {
    this.draft = undefined
  }

  private change(patch: Partial<Draft>) {
    this.draft = { ...this.draft!, error: undefined, ...patch }
  }

  private setTime(index: number, key: 'from' | 'to', value: string) {
    if (!value) return
    let minutes = parseTime(value)
    // A time input has no 24:00; midnight as an end means the end of the day
    if (key === 'to' && minutes === 0) minutes = DAY_MINUTES
    this.change({ blocks: this.draft!.blocks.map((b, i) => (i === index ? { ...b, [key]: minutes } : b)) })
  }

  private addBlock() {
    const blocks = this.draft!.blocks
    const last = blocks.reduce((end, b) => Math.max(end, b.to), 0)
    // After the last block when there is room, else the first free hour of the morning
    const from = last && last <= DAY_MINUTES - 60 ? last + 60 : blocks.length ? 0 : 6 * 60
    this.change({ blocks: [...blocks, { from: Math.min(from, DAY_MINUTES - 30), to: Math.min(from + 120, DAY_MINUTES) }] })
  }

  private toggleDay(day: Day) {
    const days = this.draft!.days
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day]
    // The tapped day can be dropped, but never every day
    if (next.length) this.change({ days: next })
  }

  private async save() {
    const draft = this.draft!
    const problem = checkBlocks(draft.blocks)
    if (problem) return this.change({ error: t(this.hass, `sched.${problem}` as Key) })
    const item = withBlocks(this.items!.get(draft.entity)!, draft.days, draft.blocks)
    this.draft = { ...draft, busy: true, error: undefined }
    try {
      const saved = await this.hass!.callWS!<ScheduleItem>(updateMessage(item))
      this.items = new Map(this.items).set(draft.entity, saved && typeof saved === 'object' && 'id' in saved ? saved : item)
      this.draft = undefined
    } catch (err) {
      const message = (err as { message?: string })?.message ?? String(err)
      this.draft = { ...draft, busy: false, error: t(this.hass, 'sched.failed', { error: message }) }
    }
  }

  private renderDay(entity: string, item: ScheduleItem | undefined, day: Day, today: Day, nowMinutes: number) {
    const draft = this.draft?.entity === entity ? this.draft : undefined
    const drafted = !!draft && draft.days.includes(day)
    const blocks = drafted ? [...draft!.blocks].sort((a, b) => a.from - b.from) : item ? blocksOf(item, day) : []
    const times = blocks.map(b => `${shortTime(b.from)}–${shortTime(b.to)}`)
    const classes = `day ${day === today ? 'today' : ''} ${drafted ? 'draft' : ''} ${draft?.day === day ? 'open' : ''}`
    const content = html`
      <span class="d">${this.dayName(day, 'short')}</span>
      <span class="bar">
        ${blocks.map(b => html`<span class="on" style="left:${(b.from / DAY_MINUTES) * 100}%;width:${((b.to - b.from) / DAY_MINUTES) * 100}%"></span>`)}
        ${day === today ? html`<span class="now" style="left:${(nowMinutes / DAY_MINUTES) * 100}%"></span>` : nothing}
      </span>
      <span class="times">${times.length ? times.map((s, i) => html`${i ? html`<br>` : nothing}${s}`) : t(this.hass, 'sched.none_short')}</span>`
    const label = `${this.dayName(day, 'long')}: ${times.join(', ') || t(this.hass, 'sched.none_short')}`
    return this.editable(entity)
      ? html`<button class=${classes} aria-label=${label} aria-expanded=${draft?.day === day} @click=${() => this.open(entity, day)}>${content}</button>`
      : html`<div class=${classes} role="img" aria-label=${label}>${content}</div>`
  }

  private renderEdit(draft: Draft) {
    const hass = this.hass
    const quick: [Key, Day[]][] = [['sched.workdays', WORKDAYS], ['sched.weekend', WEEKEND], ['sched.every_day', [...DAYS]]]
    const timeValue = (m: number) => shortTime(m === DAY_MINUTES ? 0 : m)
    return html`<div class="edit">
      <h4>${this.dayName(draft.day, 'long')}</h4>
      <div class="blocks">
        ${draft.blocks.length ? draft.blocks.map((b, i) => html`<div class="block">
          <input type="time" step="300" .value=${timeValue(b.from)} aria-label=${t(hass, 'sched.from')}
            @change=${(e: Event) => this.setTime(i, 'from', (e.target as HTMLInputElement).value)}>
          <span>${t(hass, 'sched.to')}</span>
          <input type="time" step="300" .value=${timeValue(b.to)} aria-label=${t(hass, 'sched.until')}
            @change=${(e: Event) => this.setTime(i, 'to', (e.target as HTMLInputElement).value)}>
          <button class="btn" aria-label=${t(hass, 'sched.remove')} @click=${() => this.change({ blocks: draft.blocks.filter((_, j) => j !== i) })}>
            <ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </div>`) : html`<span class="note">${t(hass, 'sched.none_day')}</span>`}
        <div><button class="text" @click=${() => this.addBlock()}><ha-icon icon="mdi:plus"></ha-icon>${t(hass, 'sched.add')}</button></div>
      </div>
      <div class="row">
        <span class="k">${t(hass, 'sched.applies')}</span>
        ${DAYS.map(day => html`<button class="chip" aria-pressed=${draft.days.includes(day)} aria-label=${this.dayName(day, 'long')}
          @click=${() => this.toggleDay(day)}>${this.dayName(day, 'short')}</button>`)}
      </div>
      <div class="row">
        ${quick.map(([key, days]) => html`<button class="chip" aria-pressed=${sameDays(draft.days, days)} @click=${() => this.change({ days })}>${t(hass, key)}</button>`)}
      </div>
      <div class="actions">
        ${draft.error ? html`<span class="error" role="alert">${draft.error}</span>` : nothing}
        <button class="text" @click=${() => this.close()}>${t(hass, 'sched.cancel')}</button>
        <button class="solid" ?disabled=${draft.busy} @click=${() => this.save()}>${t(hass, draft.busy ? 'sched.saving' : 'sched.save')}</button>
      </div>
    </div>`
  }

  private renderPlan(entity: string) {
    const hass = this.hass!
    const e = hass.states[entity]
    if (!e) return nothing
    const item = this.items?.get(entity)
    const status = scheduleStatus(hass, entity)
    const now = new Date()
    const today = dayOf(now)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const draft = this.draft?.entity === entity ? this.draft : undefined
    return html`<section class="card plan">
      <div class="head">
        <span class="dot ${status.on ? 'on' : ''}"><ha-icon icon=${String(e.attributes.icon ?? 'mdi:calendar-clock')}></ha-icon></span>
        <button class="title" @click=${() => this.moreInfo(entity)}>${entityName(e)}</button>
        <span class="state ${status.on ? 'on' : ''}">${status.text}</span>
      </div>
      ${item ? html`
        <div class="week">${DAYS.map(day => this.renderDay(entity, item, day, today, nowMinutes))}</div>
        <div class="axis"><span></span><span class="ticks">${[0, 6, 12, 18, 24].map(h => html`<span>${h}</span>`)}</span><span class="pad"></span></div>
      ` : html`<span class="note">${t(hass, !this.items && !this.failed ? 'sched.loading' : 'sched.no_times')}</span>`}
      ${draft ? this.renderEdit(draft) : nothing}
    </section>`
  }

  protected render() {
    return html`<div class="plans">${this.config!.entities.map(id => this.renderPlan(id))}</div>`
  }
}
