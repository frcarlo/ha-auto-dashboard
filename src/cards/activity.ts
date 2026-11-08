// What happened today on a page, beside its tiles: lights switched, blinds moved, doors and locks, motion.
// Like the camera page's list: the latest change large on top, the earlier ones beneath, scrolling on their own.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { activitiesFrom, type Activity } from '../activity'
import { entityAreaId } from '../model'
import { entityIcon, entityName, isActive, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity, NavPosition } from '../types'

interface ActivityConfig extends BaseConfig {
  entities: string[]
  /** Where the nav bar sits, so the list stops above it */
  nav_position?: NavPosition
}

/** The day is read again this often, and a moment after one of the entities changed */
const HISTORY_EVERY = 5 * 60_000
/** More than this many earlier changes is a day nobody scrolls through */
const MAX_ROWS = 80

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

export class AdActivity extends BaseCard<ActivityConfig> {
  static properties = { ...BaseCard.properties, items: { state: true }, now: { state: true } }
  items: Activity[] = []
  now = Date.now()

  private timer?: number
  private reload?: number
  private historyAt = 0

  static styles = [tokens, css`
    :host { display: block; --bottom: 96px; }
    :host([nav=top]) { --bottom: 12px; }
    @media (min-width: 1024px) { :host([nav=left]), :host([nav=right]) { --bottom: 12px; } }
    button { all: unset; box-sizing: border-box; cursor: pointer; }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .feed { padding: 16px 18px 8px; height: auto; display: flex; flex-direction: column; }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }
    .latest { display: block; width: 100%; padding: 14px 0 16px; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .where { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.6; min-width: 0; }
    .where span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .where ha-icon { --mdc-icon-size: 15px; flex: none; }
    .clock { font-size: 44px; font-weight: 200; letter-spacing: -0.03em; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .sentence { font-size: 16px; font-weight: 500; margin-top: 2px; }
    ul { list-style: none; margin: 0; padding: 0; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    li + li { border-top: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .row { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 4px 8px; width: 100%; padding: 10px 0; }
    .row .at { font-size: 14px; opacity: 0.6; font-variant-numeric: tabular-nums; }
    .row .what { font-size: 14px; }
    .row .where { grid-column: 2; }
    .on ha-icon { color: rgb(var(--ad-warning)); opacity: 1; }
    .empty { padding: 16px 0; opacity: 0.55; font-size: 14px; }
  `]

  getCardSize() {
    return 6
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  protected watched() {
    return this.config?.entities ?? []
  }

  connectedCallback() {
    super.connectedCallback()
    // Once a minute is enough for "5 min ago"; the day is read again every few minutes
    this.timer = window.setInterval(() => {
      this.now = Date.now()
      if (document.visibilityState !== 'hidden' && this.now - this.historyAt > HISTORY_EVERY) void this.load()
    }, 60_000)
    window.addEventListener('resize', this.fit)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
    window.clearTimeout(this.reload)
    window.removeEventListener('resize', this.fit)
  }

  protected updated(changed: Map<string, unknown>) {
    const old = changed.get('hass') as typeof this.hass
    if (!this.hass || !this.config) return
    this.setAttribute('nav', this.config.nav_position ?? 'bottom')
    this.fit()
    if (!this.historyAt) void this.load()
    // Something changed: read the day again in a moment, when HA has written it down
    if (old && this.config.entities.some(id => old.states[id]?.state !== this.hass!.states[id]?.state)) {
      window.clearTimeout(this.reload)
      this.reload = window.setTimeout(() => void this.load(), 2000)
    }
  }

  private async load() {
    const hass = this.hass
    const ids = this.config?.entities ?? []
    this.historyAt = Date.now()
    if (!hass?.callWS || !ids.length) return
    const since = startOfToday()
    try {
      const history = await hass.callWS<Record<string, { s: string; lu?: number; lc?: number }[]>>({
        type: 'history/history_during_period', start_time: new Date(since).toISOString(), entity_ids: ids,
        minimal_response: true, no_attributes: true, significant_changes_only: false,
      })
      this.items = activitiesFrom(history ?? {}, hass.states, since)
      this.now = Date.now()
    } catch {
      // Without the history (no access, recorder off) the list stays empty
    }
  }

  /**
   * Beside the tiles the list reaches from where it starts down to just above the nav bar, never further;
   * below the latest change it scrolls on its own. On a phone, stacked under the tiles, it is one screen high.
   */
  private fit = () => {
    const feed = this.renderRoot.querySelector<HTMLElement>('.feed')
    if (!feed) return
    const bottom = parseFloat(getComputedStyle(this).getPropertyValue('--bottom')) || 12
    const top = window.innerWidth <= 760 ? 56 + 12 : feed.getBoundingClientRect().top + window.scrollY
    const height = `${Math.max(320, Math.floor(window.innerHeight - top - bottom))}px`
    if (feed.style.maxHeight !== height) feed.style.maxHeight = height
  }

  private get loc() {
    return this.hass?.locale?.language ?? this.hass?.language ?? 'de'
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.loc, { hour: '2-digit', minute: '2-digit' })
  }

  private ago(ms: number) {
    const minutes = Math.round((ms - this.now) / 60_000)
    const format = new Intl.RelativeTimeFormat(this.loc, { numeric: 'auto', style: 'short' })
    return Math.abs(minutes) < 60 ? format.format(minutes, 'minute') : format.format(Math.round(minutes / 60), 'hour')
  }

  /** The entity as it was then: its name without the room, the state in HA's words, its icon in that state */
  private describe(a: Activity) {
    const hass = this.hass!
    const now = hass.states[a.entity] ?? ({ entity_id: a.entity, state: a.state, attributes: {} } as unknown as HassEntity)
    const then = { ...now, state: a.state }
    const area = hass.areas[entityAreaId(hass, a.entity) ?? '']?.name
    const name = shortName(entityName(now), area)
    const state = hass.formatEntityState?.(then, a.state) ?? a.state
    return { name, area, state, icon: entityIcon(then), on: isActive(then) }
  }

  protected render() {
    const hass = this.hass!
    const [latest, ...rest] = this.items
    const d = latest && this.describe(latest)
    return html`<aside class="card feed">
      <div class="top"><span class="label">${t(hass, 'activity.today')}</span>
        ${this.items.length ? html`<span class="label">${this.items.length === 1 ? t(hass, 'cam.events_one') : t(hass, 'cam.events', { n: this.items.length })}</span>` : nothing}</div>
      ${latest && d ? html`<button class="latest" @click=${() => this.moreInfo(latest.entity)}>
        <div class="where ${d.on ? 'on' : ''}"><ha-icon icon=${d.icon}></ha-icon><span>${[d.area, this.ago(latest.at)].filter(Boolean).join(' · ')}</span></div>
        <div class="clock">${this.time(latest.at)}</div>
        <div class="sentence">${d.name} · ${d.state}</div>
      </button>
      <ul>${rest.slice(0, MAX_ROWS).map(a => {
        const r = this.describe(a)
        return html`<li><button class="row" @click=${() => this.moreInfo(a.entity)}>
          <span class="at">${this.time(a.at)}</span><span class="what">${r.name} · ${r.state}</span>
          <span class="where ${r.on ? 'on' : ''}"><ha-icon icon=${r.icon}></ha-icon><span>${r.area ?? ''}</span></span>
        </button></li>`
      })}</ul>` : html`<div class="empty">${t(hass, 'activity.none')}</div>`}
    </aside>`
  }
}
