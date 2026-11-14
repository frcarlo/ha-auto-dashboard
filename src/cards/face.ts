// The face: when nobody has touched the screen for a while, a calm full-screen view takes over, readable from
// across the room. A large clock with the date, the weather and the next events, or a picture with the time.
// One tap brings back the page underneath, exactly as it was. The nav bar puts it into document.body.
import { LitElement, css, html, nothing, svg } from 'lit'
import { tokens } from '../styles/tokens'
import { t, type Key } from '../i18n'
import { CALENDAR_COLORS, addDays, sameDay, startOfDay, toEvent, type ApiEvent, type CalEvent } from '../calendar'
import { conditionIcon } from '../weather'
import { entityName } from '../presentation'
import { ACTIVE_PHASES, applianceIcon, appliancePhase, applianceProgress, applianceTimes, type Appliance, type AppliancePhase } from '../appliances'
import { albumPictures, browseMedia, pictureUrl, playOrder, type MediaNode } from '../slideshow'
import type { FaceStyle, HomeAssistant } from '../types'

export interface FaceSettings {
  /** Seconds without a touch; 0 shows the face right away */
  after: number
  style: FaceStyle
  weather?: string
  /** A sensor at the house that knows the temperature better than the weather service */
  temperature?: string
  calendars?: string[]
  /** The dashboard's background picture, for the photo face */
  image?: string
  /** A folder of HA's media for a slideshow on the photo face, e.g. an Immich album; wins over `image` */
  album?: string
  /** Seconds per picture of the album */
  interval?: number
  shuffle?: boolean
  /** Washer, dryer, dishwasher: shown while they run, wait or need someone */
  appliances?: Appliance[]
}

const PHASE_COLOR: Partial<Record<AppliancePhase, string>> = { running: 'warning', delayed: 'warning', paused: 'warning', finished: 'success', action: 'error', error: 'error' }

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
const EVENTS_EVERY = 15 * 60_000
const SHIFT_EVERY = 60_000
/** New pictures in the album show up without a reload */
const ALBUM_EVERY = 60 * 60_000
/** A picture that does not load is skipped; after this many in a row the slideshow waits for its next turn */
const SLIDE_TRIES = 3
/** After a tap or a touch the face waits at least this long, even when it is set to show right away */
const GRACE = 60

export class AdFace extends LitElement {
  static properties = {
    hass: { attribute: false },
    settings: { attribute: false },
    shown: { type: Boolean, reflect: true },
    now: { state: true },
    events: { state: true },
    picture: { state: true },
    slides: { state: true },
    front: { state: true },
    shift: { state: true },
  }

  hass?: HomeAssistant
  settings?: FaceSettings
  shown = false
  now = new Date()
  events: CalEvent[] = []
  picture?: string
  /** The slideshow's two layers: one shows, the other takes the next picture and fades in over it */
  slides: [string?, string?] = []
  front = 0
  shift: [number, number] = [0, 0]

  private idle?: number
  private tick?: number
  private loadedAt = 0
  private shiftedAt = 0
  private pictureFor?: string
  private albumFor?: string
  private albumAt = 0
  private albumItems: MediaNode[] = []
  private order: number[] = []
  private pos = 0
  private slideAt = 0
  private sliding = false

  private onActivity = () => {
    if (!this.shown) this.arm(false)
  }

  connectedCallback() {
    super.connectedCallback()
    for (const type of ACTIVITY) window.addEventListener(type, this.onActivity, { capture: true, passive: true })
    this.arm(true)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    for (const type of ACTIVITY) window.removeEventListener(type, this.onActivity, { capture: true })
    window.clearTimeout(this.idle)
    window.clearInterval(this.tick)
  }

  /**
   * Starts the wait for the face. "Right away" only holds when the page opens; once someone has touched
   * the screen, the face waits a minute, or nobody could ever use the page underneath.
   */
  arm(opening: boolean) {
    window.clearTimeout(this.idle)
    if (!this.settings) return
    const after = Math.max(0, this.settings.after)
    this.idle = window.setTimeout(() => this.show(), (opening ? after : Math.max(after, GRACE)) * 1000)
  }

  private show() {
    // Never over HA's edit mode, where the face would hide the editor that changes it
    if (new URLSearchParams(location.search).has('edit')) return this.arm(false)
    this.shown = true
    this.now = new Date()
    window.clearInterval(this.tick)
    this.tick = window.setInterval(() => {
      this.now = new Date()
      // Pixels that never change wear into a wall screen; the content wanders a little every minute
      if (Date.now() - this.shiftedAt > SHIFT_EVERY) {
        this.shiftedAt = Date.now()
        this.shift = [Math.round(Math.random() * 24 - 12), Math.round(Math.random() * 24 - 12)]
      }
      if (Date.now() - this.loadedAt > EVENTS_EVERY) void this.loadEvents()
      if (this.settings?.album && Date.now() - this.slideAt > (this.settings.interval ?? 30) * 1000) void this.nextSlide()
    }, 1000)
    void this.loadEvents()
    void this.loadPicture()
    if (this.settings?.album) void this.nextSlide()
  }

  private hide(ev: Event) {
    // The tap only wakes the screen; it must not reach what lies beneath
    ev.preventDefault()
    ev.stopPropagation()
    this.shown = false
    window.clearInterval(this.tick)
    this.arm(false)
  }

  protected updated(changed: Map<string, unknown>) {
    // A new wait when the settings change, e.g. a shorter time in the config
    const before = changed.get('settings') as FaceSettings | undefined
    if (changed.has('settings') && !this.shown && before?.after !== this.settings?.after) this.arm(!before)
  }

  private async loadEvents() {
    const hass = this.hass
    const ids = this.settings?.calendars ?? []
    if (!hass?.callApi || !ids.length) return
    this.loadedAt = Date.now()
    const from = startOfDay(new Date())
    const to = addDays(from, 8)
    const range = `start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`
    const lists = await Promise.all(ids.map(id => hass.callApi!<ApiEvent[]>('GET', `calendars/${id}?${range}`)
      .then(list => list.map((e, i) => toEvent(id, e, i)).filter((e): e is CalEvent => !!e))
      .catch(() => [] as CalEvent[])))
    const now = Date.now()
    this.events = lists.flat()
      .filter(e => e.end.getTime() > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay))
  }

  /** Uploaded pictures are media-source ids; HA hands out a signed URL for them */
  private async loadPicture() {
    const image = this.settings?.image?.trim()
    if (!image || this.pictureFor === image) return
    this.pictureFor = image
    if (!image.startsWith('media-source://')) {
      this.picture = image
      return
    }
    try {
      const resolved = await this.hass?.callWS?.<{ url: string }>({ type: 'media_source/resolve_media', media_content_id: image, expires: 24 * 3600 })
      this.picture = resolved?.url
    } catch {
      this.pictureFor = undefined
    }
  }

  /** The album's pictures, again every hour; a new album starts from its beginning */
  private async loadAlbum() {
    const album = this.settings?.album
    if (!album || !this.hass?.callWS) return
    if (this.albumFor === album && Date.now() - this.albumAt < ALBUM_EVERY) return
    const fresh = this.albumFor !== album
    this.albumAt = Date.now()
    try {
      const items = albumPictures(await browseMedia(this.hass, album))
      if (fresh || items.length !== this.albumItems.length) {
        this.order = playOrder(items.length, this.settings?.shuffle !== false)
        this.pos = 0
      }
      this.albumItems = items
      this.albumFor = album
    } catch {
      // Not reachable right now (Immich down): the clock or the background picture until the next try
      if (fresh) this.albumItems = []
      this.albumFor = album
    }
  }

  /** The next picture of the album, loaded first so it fades in whole */
  private async nextSlide() {
    if (this.sliding || !this.hass) return
    this.sliding = true
    this.slideAt = Date.now()
    try {
      await this.loadAlbum()
      for (let i = 0; i < Math.min(SLIDE_TRIES, this.albumItems.length); i++) {
        if (this.pos >= this.order.length) {
          // Round done: a new shuffle, so the order does not repeat
          this.order = playOrder(this.albumItems.length, this.settings?.shuffle !== false)
          this.pos = 0
        }
        const item = this.albumItems[this.order[this.pos++]!]
        if (!item) continue
        try {
          const url = await pictureUrl(this.hass, item.media_content_id)
          const img = new Image()
          img.src = url
          await img.decode()
          if (!this.shown) return
          const back = 1 - this.front
          const slides: [string?, string?] = [...this.slides]
          slides[back] = url
          this.slides = slides
          this.front = back
          return
        } catch { /* gone or not loading: the next one */ }
      }
    } finally {
      this.sliding = false
      this.slideAt = Date.now()
    }
  }

  private get loc() {
    return this.hass?.locale?.language ?? this.hass?.language ?? 'de'
  }

  private time() {
    return this.now.toLocaleTimeString(this.loc, { hour: '2-digit', minute: '2-digit' })
  }

  private date() {
    return this.now.toLocaleDateString(this.loc, { weekday: 'long', day: 'numeric', month: 'long' })
  }

  private weather() {
    const hass = this.hass!
    const w = this.settings?.weather ? hass.states[this.settings.weather] : undefined
    const sensor = this.settings?.temperature ? hass.states[this.settings.temperature] : undefined
    const fromSensor = sensor && Number.isFinite(Number(sensor.state)) ? Number(sensor.state) : undefined
    const temp = fromSensor ?? (typeof w?.attributes.temperature === 'number' ? w.attributes.temperature : undefined)
    if (temp === undefined && !w) return nothing
    const unit = String((fromSensor !== undefined ? sensor?.attributes.unit_of_measurement : w?.attributes.temperature_unit) ?? '°C')
    const value = temp === undefined ? '' : new Intl.NumberFormat(this.loc, { maximumFractionDigits: 0 }).format(temp)
    return html`<span class="weather">
      ${w ? html`<ha-icon icon=${conditionIcon(w.state)}></ha-icon>` : nothing}
      ${value ? html`<span class="temp">${value}${unit.replace(/^°.*/, '°')}</span>` : nothing}
      ${w ? html`<span class="cond">${hass.formatEntityState?.(w) ?? w.state}</span>` : nothing}
    </span>`
  }

  /** When an event is, said the short way: "13:30", "Morgen 9:00", "Fr., 14. Nov." */
  private when(e: CalEvent) {
    const hass = this.hass!
    const today = startOfDay(this.now)
    const day = sameDay(e.start, today) || e.start < today ? '' : sameDay(e.start, addDays(today, 1)) ? t(hass, 'face.tomorrow')
      : e.start.toLocaleDateString(this.loc, { weekday: 'short', day: 'numeric', month: 'short' })
    const time = e.allDay ? t(hass, 'face.all_day') : e.start.toLocaleTimeString(this.loc, { hour: '2-digit', minute: '2-digit' })
    return day ? `${day} · ${time}` : time
  }

  private color(e: CalEvent) {
    const i = Math.max(0, this.settings?.calendars?.indexOf(e.calendar) ?? 0)
    return CALENDAR_COLORS[i % CALENDAR_COLORS.length]
  }

  private eventRow(e: CalEvent) {
    return html`<li><span class="dot" style="background: rgb(${this.color(e)})"></span>
      <span class="when">${this.when(e)}</span><span class="what">${e.title}</span></li>`
  }

  /** The next event today or tomorrow, for the clock faces */
  private nextEvent() {
    const until = addDays(startOfDay(this.now), 2).getTime()
    const next = this.events.find(e => e.start.getTime() < until)
    return next ? html`<ul class="next">${this.eventRow(next)}</ul>` : nothing
  }

  /** One appliance at work: "Geschirrspüler · fertig um 23:38", with its progress along the chip */
  private applianceChip(a: Appliance) {
    const hass = this.hass!
    const phase = appliancePhase(hass, a)
    if (!ACTIVE_PHASES.includes(phase)) return undefined
    const progress = applianceProgress(hass, a, phase)
    const { end } = applianceTimes(hass, a, this.now.getTime(), progress)
    const state = (phase === 'running' || phase === 'delayed') && end !== undefined
      ? t(hass, 'done_at', { time: new Date(end).toLocaleTimeString(this.loc, { hour: '2-digit', minute: '2-digit' }) })
      : t(hass, `appliance.${phase}` as Key)
    return html`<span class="chip ${PHASE_COLOR[phase] ?? ''}">
      <ha-icon icon=${applianceIcon(a.kind)}></ha-icon><span class="text">${a.name} · ${state}</span>
      ${progress !== undefined && phase !== 'finished' ? html`<span class="bar" style="width: ${progress}%"></span>` : nothing}
    </span>`
  }

  /** What is going on right now, small at the bottom: appliances at work and music that plays */
  private live() {
    const hass = this.hass!
    const appliances = (this.settings?.appliances ?? []).map(a => this.applianceChip(a)).filter(Boolean).slice(0, 3)
    const playing = Object.values(hass.states).filter(s => s.entity_id.startsWith('media_player.') && s.state === 'playing').slice(0, 2)
    if (!appliances.length && !playing.length) return nothing
    return html`<div class="live">${appliances}${playing.map(p => {
      const title = [p.attributes.media_title, p.attributes.media_artist].filter(Boolean).join(' – ')
      return html`<span class="chip"><ha-icon icon="mdi:music"></ha-icon><span class="text">${title || entityName(p)}</span></span>`
    })}</div>`
  }

  private analog() {
    const h = this.now.getHours() % 12
    const m = this.now.getMinutes()
    const s = this.now.getSeconds()
    const hand = (deg: number, len: number, width: number, cls: string) =>
      svg`<line class=${cls} x1="100" y1="100" x2=${100 + len * Math.sin(deg * Math.PI / 180)} y2=${100 - len * Math.cos(deg * Math.PI / 180)} stroke-width=${width} stroke-linecap="round"></line>`
    return html`<svg class="dial" viewBox="0 0 200 200" role="img" aria-label=${this.time()}>
      <circle class="rim" cx="100" cy="100" r="98"></circle>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = i * 30 * Math.PI / 180
        return svg`<line class="mark" x1=${100 + 84 * Math.sin(a)} y1=${100 - 84 * Math.cos(a)} x2=${100 + 92 * Math.sin(a)} y2=${100 - 92 * Math.cos(a)} stroke-width=${i % 3 ? 2 : 4} stroke-linecap="round"></line>`
      })}
      ${hand((h + m / 60) * 30, 50, 7, 'hour')}
      ${hand((m + s / 60) * 6, 76, 4, 'minute')}
      ${hand(s * 6, 82, 1.5, 'second')}
      <circle cx="100" cy="100" r="4" class="pin"></circle>
    </svg>`
  }

  private content(photo: boolean) {
    const style = this.settings!.style
    if (photo) return html`<div class="photo">
      <div class="corner"><div class="time small">${this.time()}</div><div class="date">${this.date()}</div></div>
      <div class="corner right">${this.weather()}${this.nextEvent()}</div>
    </div>`
    if (style === 'calendar') return html`<div class="agenda">
      <div class="side"><div class="time medium">${this.time()}</div><div class="date">${this.date()}</div>${this.weather()}</div>
      <ul class="events">${this.events.length ? this.events.slice(0, 7).map(e => this.eventRow(e)) : html`<li class="none">${t(this.hass, 'face.no_events')}</li>`}</ul>
    </div>`
    if (style === 'analog') return html`<div class="center">${this.analog()}<div class="date">${this.date()}</div><div class="info">${this.weather()}${this.nextEvent()}</div></div>`
    return html`<div class="center"><div class="time">${this.time()}</div><div class="date">${this.date()}</div><div class="info">${this.weather()}${this.nextEvent()}</div></div>`
  }

  static styles = [tokens, css`
    :host {
      position: fixed; inset: 0; z-index: 9; display: none; overflow: hidden; cursor: pointer;
      color: rgb(var(--ad-on-surface)); background: var(--ad-bg, #0f172a);
      font-variant-numeric: tabular-nums; -webkit-tap-highlight-color: transparent; user-select: none;
    }
    :host([shown]) { display: block; animation: fade 0.8s ease both; }
    @keyframes fade { from { opacity: 0; } }
    /* A soft light in the accent color behind the clock, like the glass backdrop of the dashboard */
    .wake { position: absolute; inset: 0; outline: none; }
    .backdrop { position: absolute; inset: -10%; background: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--ad-primary), 0.22), transparent 70%); }
    .picture { position: absolute; inset: 0; background-size: cover; background-position: center; }
    .picture::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, 0.62), transparent 45%, transparent 75%, rgba(0, 0, 0, 0.25)); }
    /* The slideshow: the next picture fades in over the one before */
    .picture.slide { overflow: hidden; background: #000; opacity: 0; transition: opacity 1.6s ease; }
    .picture.slide.front { opacity: 1; z-index: 1; }
    .slide .fill, .slide .fit { position: absolute; background-position: center; background-repeat: no-repeat; }
    .slide .fill { inset: -48px; background-size: cover; filter: blur(32px) brightness(0.55); }
    .slide .fit { inset: 0; background-size: contain; }
    .stage { position: absolute; inset: 0; z-index: 2; transition: transform 2s ease; }

    .center { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px; box-sizing: border-box; text-align: center; }
    .time { font-size: clamp(88px, min(24vw, 34vh), 280px); font-weight: 200; letter-spacing: -0.04em; line-height: 0.95; }
    .time.medium { font-size: clamp(64px, min(12vw, 20vh), 160px); }
    .time.small { font-size: clamp(56px, min(9vw, 14vh), 120px); }
    .date { font-size: clamp(18px, 2.6vw, 30px); font-weight: 400; opacity: var(--ad-o2); }
    .info { margin-top: clamp(16px, 4vh, 40px); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px 40px; }
    .weather { display: inline-flex; align-items: center; gap: 12px; font-size: clamp(18px, 2.4vw, 28px); }
    .weather ha-icon { --mdc-icon-size: clamp(28px, 3.4vw, 40px); opacity: 0.85; }
    .weather .temp { font-weight: 500; }
    .weather .cond { opacity: var(--ad-o2); }

    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: baseline; gap: 12px; min-width: 0; font-size: clamp(16px, 2vw, 24px); }
    li .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; align-self: center; }
    li .when { flex: none; opacity: var(--ad-o2); }
    li .what { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
    .next li { max-width: 60vw; }

    .dial { width: min(64vmin, 440px); height: auto; }
    .dial .rim { fill: rgba(var(--ad-on-surface), 0.04); stroke: rgba(var(--ad-on-surface), 0.08); stroke-width: 1; }
    .dial .mark { stroke: rgba(var(--ad-on-surface), 0.45); }
    .dial .hour, .dial .minute { stroke: rgb(var(--ad-on-surface)); }
    .dial .second { stroke: rgb(var(--ad-primary)); }
    .dial .pin { fill: rgb(var(--ad-primary)); }

    .photo { height: 100%; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 40px 48px; box-sizing: border-box; color: #fff; }
    .photo .corner { display: flex; flex-direction: column; gap: 8px; min-width: 0; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4); }
    .photo .right { align-items: flex-end; text-align: right; }

    .agenda { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: center; gap: 48px; padding: 48px clamp(32px, 6vw, 96px); box-sizing: border-box; }
    .agenda .side { display: flex; flex-direction: column; gap: 12px; }
    .agenda .events { display: flex; flex-direction: column; gap: clamp(12px, 2.4vh, 22px); }
    .agenda .none { opacity: 0.6; }
    @media (max-width: 700px) {
      .agenda { grid-template-columns: 1fr; align-content: center; gap: 32px; }
    }

    .live {
      position: absolute; z-index: 2; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%);
      display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: max-content; max-width: calc(100vw - 48px);
    }
    .chip {
      position: relative; display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px; border-radius: 18px; min-width: 0; max-width: 100%;
      box-sizing: border-box; background: rgba(var(--ad-on-surface), 0.1); font-size: var(--ad-fs-m); white-space: nowrap; overflow: hidden;
    }
    .chip .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .chip ha-icon { flex: none; --mdc-icon-size: 18px; }
    .chip.warning ha-icon { color: rgb(var(--ad-warning)); }
    .chip.success ha-icon { color: rgb(var(--ad-success)); }
    .chip.error ha-icon { color: rgb(var(--ad-error)); }
    /* How far the run is, as a thin line along the bottom of the chip */
    .chip .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: rgb(var(--ad-warning)); opacity: 0.8; }
    .on-photo .chip { background: rgba(0, 0, 0, 0.35); color: #fff; }

    @media (prefers-reduced-motion: reduce) {
      :host([shown]) { animation: none; }
      .stage, .picture.slide { transition: none; }
    }
  `]

  /** One picture of the slideshow, whole; a portrait one on a blurred, darker copy of itself instead of black bars */
  private slide(url: string | undefined, front: boolean) {
    if (!url) return nothing
    const bg = `background-image: url(${JSON.stringify(url)})`
    return html`<div class="picture slide ${front ? 'front' : ''}"><div class="fill" style=${bg}></div><div class="fit" style=${bg}></div></div>`
  }

  protected render() {
    if (!this.shown || !this.hass || !this.settings) return nothing
    // The album's slideshow, else the one picture; without either (none set, or still loading) the clock
    const slideshow = this.settings.style === 'photo' && !!this.settings.album && this.slides.some(Boolean)
    const photo = slideshow || (this.settings.style === 'photo' && !!this.picture)
    const layer = (url: string | undefined) => url
      ? html`<div class="picture" style="background-image: url(${JSON.stringify(url)})"></div>` : nothing
    return html`<div class="wake ${photo ? 'on-photo' : ''}" @click=${(ev: Event) => this.hide(ev)}
      role="button" tabindex="0" aria-label=${t(this.hass, 'face.wake')}
      @keydown=${(ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape') this.hide(ev) }}>
      ${slideshow ? [0, 1].map(i => this.slide(this.slides[i], i === this.front))
        : photo ? layer(this.picture) : html`<div class="backdrop"></div>`}
      <div class="stage" style="transform: translate(${this.shift[0]}px, ${this.shift[1]}px)">${this.content(photo)}</div>
      ${this.live()}
    </div>`
  }
}

if (!customElements.get('ad-face')) customElements.define('ad-face', AdFace)
