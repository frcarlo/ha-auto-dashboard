// The camera page: a picture of every camera, refreshed every few seconds, and beside them what the cameras
// noticed today (a ring at the door, a package, a person, a car). A tap on a camera opens it large and live,
// with its last detection, the lights beside it and tabs for the others.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { DETECTION_ICON, detectionsFrom, type CameraInfo, type Detection } from '../cameras'
import { entityName } from '../presentation'
import { tokens } from '../styles/tokens'
import type { NavPosition } from '../types'

interface CamerasCardConfig extends BaseConfig {
  cameras: CameraInfo[]
  /** Where the nav bar sits, so the list of detections stops above it */
  nav_position?: NavPosition
}

type CardHelpers = { createCardElement(config: object): HTMLElement & { hass?: unknown } }
let helpers: Promise<CardHelpers> | undefined
const loadHelpers = () => {
  const load = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers
  return load ? (helpers ??= load()) : undefined
}

/** How often the still pictures are fetched anew */
const PICTURE_EVERY = 10_000
/** The detections are read again this often, and right after a sensor sees something */
const HISTORY_EVERY = 5 * 60_000

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

export class AdCameras extends BaseCard<CamerasCardConfig> {
  static properties = {
    ...BaseCard.properties,
    selected: { state: true },
    detections: { state: true },
    pictures: { state: true },
    now: { state: true },
  }

  selected?: string
  detections: Detection[] = []
  /** The last picture that loaded per camera, with when; a new one replaces it only once it is there */
  pictures: Record<string, { url: string; at: number }> = {}
  now = Date.now()

  private timer?: number
  private historyAt = 0
  private historyFor = ''
  private reload?: number
  private live?: HTMLElement & { hass?: unknown }
  private liveFor?: string

  getCardSize() {
    return 8
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  protected watched() {
    return (this.config?.cameras ?? []).flatMap(c => [c.entity, ...(c.detections ?? []).map(d => d.entity), ...(c.lights ?? [])])
  }

  connectedCallback() {
    super.connectedCallback()
    this.timer = window.setInterval(() => this.tick(), 1000)
    window.addEventListener('resize', this.fitFeed)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
    window.clearTimeout(this.reload)
    window.removeEventListener('resize', this.fitFeed)
    // The stream stops with its card
    this.live = undefined
    this.liveFor = undefined
  }

  /**
   * Beside the cameras the list of detections reaches from where it starts down to just above the nav bar,
   * never further; below the first entry it scrolls on its own. Stacked on a phone it keeps its full length.
   */
  private fitFeed = () => {
    const feed = this.renderRoot.querySelector<HTMLElement>('.feed')
    if (!feed) return
    if (getComputedStyle(feed).position !== 'sticky') {
      feed.style.removeProperty('max-height')
      return
    }
    const bottom = parseFloat(getComputedStyle(this).getPropertyValue('--bottom')) || 12
    const height = `${Math.max(320, Math.floor(window.innerHeight - feed.getBoundingClientRect().top - bottom))}px`
    if (feed.style.maxHeight !== height) feed.style.maxHeight = height
  }

  private tick() {
    this.now = Date.now()
    if (document.visibilityState === 'hidden') return
    if (!this.selected) {
      for (const camera of this.config?.cameras ?? []) {
        if (this.now - (this.pictures[camera.entity]?.at ?? 0) >= PICTURE_EVERY) this.fetchPicture(camera.entity)
      }
    }
    if (this.now - this.historyAt > HISTORY_EVERY) void this.loadHistory()
  }

  protected updated(changed: Map<string, unknown>) {
    const old = changed.get('hass') as typeof this.hass
    if (!this.hass || !this.config) return
    this.setAttribute('nav', this.config.nav_position ?? 'bottom')
    this.fitFeed()
    if (!this.historyAt) void this.loadHistory()
    // A sensor just saw something: read the day again in a moment, when HA has written it down
    const fresh = (this.config.cameras ?? []).flatMap(c => c.detections ?? [])
      .some(d => old && old.states[d.entity] !== this.hass!.states[d.entity] && this.hass!.states[d.entity]?.state !== 'off')
    if (fresh) {
      window.clearTimeout(this.reload)
      this.reload = window.setTimeout(() => void this.loadHistory(), 2000)
    }
    if (!Object.keys(this.pictures).length) for (const c of this.config.cameras ?? []) this.fetchPicture(c.entity)
    if (this.live) this.live.hass = this.hass
  }

  /** A still from HA's camera proxy, loaded aside so the old one stays until the new one is there */
  private fetchPicture(entity: string) {
    const src = this.hass?.states[entity]?.attributes.entity_picture as string | undefined
    if (!src) return
    const at = Date.now()
    this.pictures = { ...this.pictures, [entity]: { url: this.pictures[entity]?.url ?? '', at } }
    const url = src.startsWith('data:') ? src : `${src}${src.includes('?') ? '&' : '?'}_=${at}`
    const img = new Image()
    img.onload = () => { this.pictures = { ...this.pictures, [entity]: { url, at } } }
    img.src = url
  }

  private async loadHistory() {
    const hass = this.hass
    const cameras = this.config?.cameras ?? []
    const ids = cameras.flatMap(c => (c.detections ?? []).map(d => d.entity))
    this.historyAt = Date.now()
    if (!hass?.callWS || !ids.length) return
    const since = startOfToday()
    try {
      const history = await hass.callWS<Record<string, { s: string; lu?: number; lc?: number }[]>>({
        type: 'history/history_during_period', start_time: new Date(since).toISOString(), entity_ids: ids,
        minimal_response: true, no_attributes: true, significant_changes_only: false,
      })
      this.detections = detectionsFrom(history ?? {}, cameras, since)
      this.historyFor = new Date(since).toDateString()
    } catch {
      // Without the history (no access, recorder off) the page shows the pictures only
    }
  }

  private camera(entity: string) {
    return this.config!.cameras.find(c => c.entity === entity)
  }

  private name(entity: string) {
    return this.camera(entity)?.name ?? entityName(this.hass!.states[entity]!)
  }

  private get loc() {
    return this.hass?.locale?.language ?? this.hass?.language ?? 'de'
  }

  private time(ms: number, seconds = false) {
    return new Date(ms).toLocaleTimeString(this.loc, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) })
  }

  private ago(ms: number) {
    const minutes = Math.round((ms - this.now) / 60_000)
    const format = new Intl.RelativeTimeFormat(this.loc, { numeric: 'auto', style: 'short' })
    return Math.abs(minutes) < 60 ? format.format(minutes, 'minute') : format.format(Math.round(minutes / 60), 'hour')
  }

  private open(entity: string) {
    this.selected = entity
    this.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  private back() {
    this.selected = undefined
    this.live = undefined
    this.liveFor = undefined
    for (const c of this.config?.cameras ?? []) this.fetchPicture(c.entity)
  }

  /** HA's own camera card plays the stream (WebRTC or HLS, whatever the camera offers) */
  private liveCard(entity: string) {
    if (this.liveFor === entity && this.live) return this.live
    const load = loadHelpers()
    if (!load) return null
    this.liveFor = entity
    this.live = undefined
    void load.then(h => {
      if (this.liveFor !== entity) return
      const el = h.createCardElement({ type: 'picture-entity', entity, camera_view: 'live', show_name: false, show_state: false, tap_action: { action: 'none' }, hold_action: { action: 'more-info' } })
      el.hass = this.hass
      this.live = el
      this.requestUpdate()
    })
    return undefined
  }

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; --bottom: 96px; }
    :host([nav=top]) { --bottom: 12px; }
    @media (min-width: 1024px) { :host([nav=left]), :host([nav=right]) { --bottom: 12px; } }
    button { all: unset; box-sizing: border-box; cursor: pointer; }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
    /* Beside the cameras the list is at most a screen high and scrolls on its own; it stays in view while the cameras scroll */
    @container (min-width: 880px) {
      .page.with-feed { grid-template-columns: minmax(0, 1fr) 320px; }
      .page.with-feed .feed {
        position: sticky; top: calc(var(--header-height, 56px) + 12px); display: flex; flex-direction: column;
        max-height: calc(100vh - var(--header-height, 56px) - var(--bottom) - 120px);
      }
      .page.with-feed .rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    }

    .tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
    .tile { grid-column: span 2; display: flex; flex-direction: column; }
    .tile.wide { grid-column: span 3; }
    .tile.solo { grid-column: span 6; }
    @container (max-width: 640px) {
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .tile, .tile.wide { grid-column: span 1; }
      .tile.solo { grid-column: span 2; }
    }
    @container (max-width: 400px) {
      .tiles { grid-template-columns: minmax(0, 1fr); }
      .tile, .tile.wide, .tile.solo { grid-column: span 1; }
    }
    .shot { position: relative; aspect-ratio: 16 / 10; background: rgba(var(--ad-on-surface), 0.08); overflow: hidden; }
    .shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .shot .none { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0.35; }
    .shot .none ha-icon { --mdc-icon-size: 36px; }
    .badge {
      position: absolute; display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px;
      background: rgba(255, 255, 255, 0.88); color: #111827; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; font-variant-numeric: tabular-nums;
    }
    .shot .badge { top: 10px; right: 10px; }
    .badge .rec { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ad-error)); }
    .caption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 14px 12px; min-width: 0; }
    .caption .title { font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .caption .seen { flex: none; font-size: 12px; opacity: 0.55; font-variant-numeric: tabular-nums; }
    .caption .seen.fresh { color: rgb(var(--ad-warning)); opacity: 1; }

    .feed { padding: 16px 18px 8px; height: auto; }
    .feed .top, .detail .label { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .label-text { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }
    .latest { display: block; width: 100%; padding: 14px 0 16px; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .where { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.6; }
    .where ha-icon { --mdc-icon-size: 15px; }
    .clock { font-size: 44px; font-weight: 200; letter-spacing: -0.03em; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .sentence { font-size: 16px; font-weight: 500; margin-top: 2px; }
    ul { list-style: none; margin: 0; padding: 0; }
    .rows li + li { border-top: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .row { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 4px 8px; width: 100%; padding: 10px 0; }
    .row .at { font-size: 14px; opacity: 0.6; font-variant-numeric: tabular-nums; }
    .row .what { font-size: 14px; }
    .row .where { grid-column: 2; }
    .empty { padding: 16px 0; opacity: 0.55; font-size: 14px; }

    .head { display: flex; align-items: center; gap: 16px; margin: 0 0 12px; min-width: 0; }
    .backlink { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px 6px 6px; border-radius: 18px; font-size: 14px; background: rgba(var(--ad-on-surface), 0.08); }
    .head h2 { margin: 0; font-size: 26px; font-weight: 500; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
    @container (min-width: 760px) { .detail { grid-template-columns: minmax(0, 1fr) 300px; } }
    .stage { position: relative; height: auto; }
    .stage .player { --ha-card-border-radius: 0; --ha-card-box-shadow: none; --ha-card-border-width: 0; }
    .stage .fallback { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; }
    .stage .badge { left: 12px; bottom: 12px; pointer-events: none; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .side .card { height: auto; padding: 14px 16px; }
    .control { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 12px 16px; }
    .control .line { display: flex; align-items: center; justify-content: space-between; }
    .control .state { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }
    .control .state.on { color: rgb(var(--ad-warning)); opacity: 1; }
    .control .title { font-size: 15px; font-weight: 500; }
    .control .hint { font-size: 12px; opacity: 0.55; }
    .control ha-icon { --mdc-icon-size: 18px; opacity: 0.7; }
    .control.on ha-icon { color: rgb(var(--ad-warning)); opacity: 1; }
    .tabs { display: flex; gap: 4px 20px; flex-wrap: wrap; margin-top: 16px; padding: 0 4px; }
    .tabs button { padding: 8px 0; font-size: 15px; opacity: 0.55; border-bottom: 2px solid transparent; }
    .tabs button[aria-current='true'] { opacity: 1; font-weight: 500; border-bottom-color: currentColor; }
  `]

  private kindText(d: Detection) {
    return t(this.hass, `cam.${d.kind}` as Key)
  }

  private feed() {
    const hass = this.hass!
    const list = this.detections
    const [latest, ...rest] = list
    return html`<aside class="card feed">
      <div class="top"><span class="label-text">${t(hass, 'cam.today')}</span>
        ${list.length ? html`<span class="label-text">${list.length === 1 ? t(hass, 'cam.events_one') : t(hass, 'cam.events', { n: list.length })}</span>` : nothing}</div>
      ${latest ? html`<button class="latest" @click=${() => this.open(latest.camera)}>
        <div class="where"><ha-icon icon=${DETECTION_ICON[latest.kind]}></ha-icon>${this.name(latest.camera)} · ${this.ago(latest.at)}</div>
        <div class="clock">${this.time(latest.at)}</div>
        <div class="sentence">${this.kindText(latest)}</div>
      </button>
      <ul class="rows">${rest.slice(0, 30).map(d => html`<li><button class="row" @click=${() => this.open(d.camera)}>
        <span class="at">${this.time(d.at)}</span><span class="what">${this.kindText(d)}</span>
        <span class="where"><ha-icon icon=${DETECTION_ICON[d.kind]}></ha-icon>${this.name(d.camera)}</span>
      </button></li>`)}</ul>` : html`<div class="empty">${t(hass, 'cam.none_today')}</div>`}
    </aside>`
  }

  private tile(camera: CameraInfo, size: string) {
    const hass = this.hass!
    const picture = this.pictures[camera.entity]
    const last = this.detections.find(d => d.camera === camera.entity)
    const fresh = !!last && this.now - last.at < 5 * 60_000
    const seen = last ? `${this.time(last.at)} · ${t(hass, `cam.kind.${last.kind}` as Key)}` : camera.detections?.length ? t(hass, 'cam.quiet') : ''
    return html`<button class="card tile ${size}" @click=${() => this.open(camera.entity)} aria-label=${camera.name}>
      <div class="shot">
        ${picture?.url ? html`<img src=${picture.url} alt="" loading="lazy">` : html`<div class="none"><ha-icon icon="mdi:cctv"></ha-icon></div>`}
        ${picture?.url ? html`<span class="badge">${t(hass, 'cam.picture')} · ${this.time(picture.at)}</span>` : nothing}
      </div>
      <div class="caption"><span class="title">${camera.name}</span>${seen ? html`<span class="seen ${fresh ? 'fresh' : ''}">${seen}</span>` : nothing}</div>
    </button>`
  }

  private grid() {
    const cameras = this.config!.cameras
    const n = cameras.length
    // Rows of three; what does not fit three to a row goes two to a row at the top, bigger
    const wide = n === 1 ? 0 : n % 3 === 2 ? 2 : n % 3 === 1 ? 4 : 0
    const withFeed = cameras.some(c => c.detections?.length)
    return html`<div class="page ${withFeed ? 'with-feed' : ''}">
      <section>
        <div class="tiles">${cameras.map((c, i) => this.tile(c, n === 1 ? 'solo' : i < wide ? 'wide' : ''))}</div>
      </section>
      ${withFeed ? this.feed() : nothing}
    </div>`
  }

  private control(id: string) {
    const hass = this.hass!
    const e = hass.states[id]
    if (!e) return nothing
    const on = e.state === 'on'
    return html`<button class="card control ${on ? 'on' : ''}" @click=${() => this.toggle(e)} ?disabled=${!this.canControl(id)}>
      <span class="line"><ha-icon icon=${on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline'}></ha-icon><span class="state ${on ? 'on' : ''}">${hass.formatEntityState?.(e) ?? e.state}</span></span>
      <span class="title">${entityName(e)}</span>
      <span class="hint">${t(hass, on ? 'cam.light_hint_on' : 'cam.light_hint_off')}</span>
    </button>`
  }

  private detail(entity: string) {
    const hass = this.hass!
    const camera = this.camera(entity)!
    const own = this.detections.filter(d => d.camera === entity)
    const [last, ...earlier] = own
    const live = this.liveCard(entity)
    const still = this.pictures[entity]?.url || (hass.states[entity]?.attributes.entity_picture as string | undefined)
    return html`
      <div class="head">
        <button class="backlink" @click=${() => this.back()}><ha-icon icon="mdi:chevron-left"></ha-icon>${t(hass, 'cam.all')}</button>
        <h2>${camera.name}</h2>
      </div>
      <div class="detail">
        <div class="card stage">
          ${live ? html`<div class="player">${live}</div>` : still ? html`<img class="fallback" src=${still} alt="">` : html`<div class="shot"><div class="none"><ha-icon icon="mdi:cctv"></ha-icon></div></div>`}
          <span class="badge"><span class="rec"></span>${t(hass, 'cam.live')} · ${this.time(this.now, true)}</span>
        </div>
        <div class="side">
          ${camera.detections?.length ? html`<div class="card">
            <span class="label-text">${t(hass, 'cam.last')}</span>
            ${last ? html`
              <div class="clock">${this.time(last.at)}</div>
              <div class="where">${this.ago(last.at)} · ${t(hass, `cam.kind.${last.kind}` as Key)}</div>
              <div class="sentence">${this.kindText(last)}</div>
              ${earlier.length ? html`<ul class="rows">${earlier.slice(0, 4).map(d => html`<li><div class="row"><span class="at">${this.time(d.at)}</span><span class="what">${this.kindText(d)}</span></div></li>`)}</ul>` : nothing}
            ` : html`<div class="empty">${t(hass, 'cam.none_today')}</div>`}
          </div>` : nothing}
          ${(camera.lights ?? []).map(id => this.control(id))}
          <button class="card control" @click=${() => this.moreInfo(entity)}>
            <span class="line"><ha-icon icon="mdi:cctv"></ha-icon></span>
            <span class="title">${t(hass, 'cam.more')}</span>
            <span class="hint">${t(hass, 'cam.more_sub')}</span>
          </button>
        </div>
      </div>
      ${this.config!.cameras.length > 1 ? html`<nav class="tabs">${this.config!.cameras.map(c => html`<button aria-current=${String(c.entity === entity)} @click=${() => this.open(c.entity)}>${c.name}</button>`)}</nav>` : nothing}`
  }

  protected render() {
    if (!this.hass || !this.config?.cameras?.length) return nothing
    // A new day starts a new list
    if (this.historyFor && this.historyFor !== new Date().toDateString()) this.historyAt = 0
    const selected = this.selected && this.camera(this.selected) ? this.selected : undefined
    return selected ? this.detail(selected) : this.grid()
  }
}
