// The popup: when a rule's trigger fires (someone rings at the door), a window opens over whatever page is showing,
// with the camera live and buttons for the door. Opening and unlocking ask once more; locking goes right away.
// It closes on its own a while after the ring, once the trigger is off again, or with a tap on the close button;
// a bar under the title runs down until then.
// The nav bar puts one into document.body, like the face, so it is there on every page of the dashboard.
import { css, html, nothing } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { BaseCard, type BaseConfig } from './base'
import { tokens } from '../styles/tokens'
import { t, type Key } from '../i18n'
import { domainOf, entityName, isUnavailable } from '../presentation'
import { ASKS, fired, lockButtons, stillOn, type LockButton, type Popup } from '../popups'
import type { HomeAssistant } from '../types'

export interface PopupConfig extends BaseConfig {
  popups: Popup[]
}

type CardHelpers = { createCardElement(config: object): HTMLElement & { hass?: unknown } }
let helpers: Promise<CardHelpers> | undefined
const loadHelpers = () => {
  const load = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers
  return load ? (helpers ??= load()) : undefined
}

/** A tap inside keeps the window at least this long */
const AFTER_TOUCH = 30_000
/** While the trigger is still on, look again this often */
const RECHECK = 5_000
/** A button waiting for its second tap gives up after this */
const ARMED_FOR = 4_000
/** Without HA's live card (the dev harness) the still is fetched this often */
const STILL_EVERY = 2_000

const LOCK_ICON: Record<LockButton, string> = { open: 'mdi:door-open', unlock: 'mdi:lock-open-variant-outline', lock: 'mdi:lock-outline' }
const LOCK_LABEL: Record<LockButton, Key> = { open: 'popup.open', unlock: 'popup.unlock', lock: 'popup.lock' }
const LOCK_AGAIN: Partial<Record<LockButton, Key>> = { open: 'popup.open_again', unlock: 'popup.unlock_again' }

export class AdPopup extends BaseCard<PopupConfig> {
  static properties = { ...BaseCard.properties, shown: { state: true }, armed: { state: true }, still: { state: true }, countdown: { state: true } }

  /** The popup on screen and when its trigger fired */
  shown?: { popup: Popup; at: number }
  /** `entity|button` waiting for its second tap */
  armed?: string
  still?: string
  /** When the window closes and how long the bar takes to run down from now; `hold` while the trigger keeps it open */
  countdown?: { until: number; ms: number } | { hold: true }

  private closeTimer?: number
  private armTimer?: number
  private stillTimer?: number
  private touchedAt = 0
  private live?: HTMLElement & { hass?: unknown }
  private liveFor?: string

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.shown) this.close()
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('keydown', this.onKey)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.onKey)
    this.close()
  }

  protected watched() {
    const popups = this.config?.popups ?? []
    const open = this.shown?.popup
    return [...popups.map(p => p.trigger), ...(open ? [...(open.camera ? [open.camera] : []), ...open.actions] : [])]
  }

  protected shouldUpdate(changed: Map<string | number | symbol, unknown>) {
    if (changed.has('hass') && this.hass && this.config) this.watch(changed.get('hass') as HomeAssistant | undefined)
    if (this.live && changed.has('hass')) this.live.hass = this.hass
    return super.shouldUpdate(changed as never)
  }

  /** A trigger that fired since the last states opens its popup; a second ring starts the wait anew */
  private watch(old: HomeAssistant | undefined) {
    if (!old) return
    for (const popup of this.config!.popups) {
      if (fired(popup, old.states[popup.trigger], this.hass!.states[popup.trigger])) this.show(popup)
    }
  }

  /** Opens a popup, also from outside (the dev harness, a test) */
  show(popup: Popup) {
    const same = this.shown?.popup.trigger === popup.trigger
    this.shown = { popup, at: Date.now() }
    if (!same) {
      this.armed = undefined
      this.live = undefined
      this.liveFor = undefined
    }
    this.touchedAt = 0
    this.schedule()
    this.startStill()
  }

  close() {
    this.shown = undefined
    this.armed = undefined
    this.live = undefined
    this.liveFor = undefined
    this.still = undefined
    this.countdown = undefined
    window.clearTimeout(this.closeTimer)
    window.clearTimeout(this.armTimer)
    window.clearInterval(this.stillTimer)
  }

  /** Closes once the popup's time is up, counted from the ring or the last tap inside, and the trigger is off */
  private schedule() {
    window.clearTimeout(this.closeTimer)
    if (!this.shown) return
    const until = Math.max(this.shown.at + this.shown.popup.close_after * 1000, this.touchedAt + AFTER_TOUCH)
    // A tap that moves the end starts the bar full again; one that doesn't leaves it running
    if (!this.countdown || !('until' in this.countdown) || this.countdown.until !== until) {
      this.countdown = { until, ms: Math.max(0, until - Date.now()) }
    }
    this.closeTimer = window.setTimeout(() => this.check(), Math.max(0, until - Date.now()))
  }

  private check() {
    if (!this.shown) return
    if (stillOn(this.shown.popup, this.hass?.states[this.shown.popup.trigger])) {
      this.countdown = { hold: true }
      this.closeTimer = window.setTimeout(() => this.check(), RECHECK)
      return
    }
    this.close()
  }

  private touch = () => {
    this.touchedAt = Date.now()
    this.schedule()
  }

  /** HA's own camera card plays the stream; until it is there (or where there is none) a still stands in */
  private liveCard(camera: string) {
    if (this.liveFor === camera) return this.live
    const load = loadHelpers()
    if (!load) return undefined
    this.liveFor = camera
    void load.then(h => {
      if (this.liveFor !== camera) return
      const el = h.createCardElement({
        type: 'picture-entity', entity: camera, camera_view: 'live', show_name: false, show_state: false,
        tap_action: { action: 'none' }, hold_action: { action: 'none' },
      })
      el.hass = this.hass
      this.live = el
      this.requestUpdate()
    })
    return undefined
  }

  private startStill() {
    window.clearInterval(this.stillTimer)
    this.fetchStill()
    if (!loadHelpers()) this.stillTimer = window.setInterval(() => this.fetchStill(), STILL_EVERY)
  }

  /** The newest still, loaded aside so the old one stays until it is there */
  private fetchStill() {
    const camera = this.shown?.popup.camera
    const src = camera ? this.hass?.states[camera]?.attributes.entity_picture as string | undefined : undefined
    if (!src) return
    const url = src.startsWith('data:') ? src : `${src}${src.includes('?') ? '&' : '?'}_=${Date.now()}`
    const img = new Image()
    img.onload = () => { if (this.shown?.popup.camera === camera) this.still = url }
    img.src = url
  }

  private press(id: string, button: LockButton | 'run') {
    const key = `${id}|${button}`
    const asks = button === 'run' || ASKS.includes(button)
    window.clearTimeout(this.armTimer)
    if (asks && this.armed !== key) {
      this.armed = key
      this.armTimer = window.setTimeout(() => { this.armed = undefined }, ARMED_FOR)
      return
    }
    this.armed = undefined
    const entity = this.hass!.states[id]
    if (!entity) return
    if (button === 'run') void this.toggle(entity)
    else void this.call('lock', button, id)
  }

  private status(id: string) {
    const entity = this.hass!.states[id]
    if (this.noAnswer(id)) return html`<span class="status failed">${t(this.hass, 'wait.failed')}</span>`
    if (this.waiting(id)) return html`<span class="status busy">${t(this.hass, 'wait.switching')}</span>`
    return html`<span class="status">${entity ? this.hass!.formatEntityState?.(entity) ?? entity.state : ''}</span>`
  }

  private button(id: string, button: LockButton | 'run', icon: string, label: string, again: string | undefined, disabled: boolean) {
    const armed = this.armed === `${id}|${button}`
    return html`<button class="act ${button} ${armed ? 'armed' : ''}" ?disabled=${disabled} aria-live="polite"
      @click=${() => this.press(id, button)}>
      <ha-icon icon=${icon}></ha-icon><span>${armed && again ? again : label}</span>
    </button>`
  }

  private action(id: string) {
    const entity = this.hass!.states[id]
    if (!entity) return nothing
    const disabled = isUnavailable(entity) || !this.canControl(id) || this.waiting(id)
    const name = html`<div class="name"><span>${entityName(entity)}</span>${this.status(id)}</div>`
    if (domainOf(id) === 'lock') {
      const buttons = lockButtons(entity)
      return html`<div class="group">${name}<div class="buttons">${buttons.map(b =>
        this.button(id, b, LOCK_ICON[b], t(this.hass, LOCK_LABEL[b]), LOCK_AGAIN[b] ? t(this.hass, LOCK_AGAIN[b]!) : undefined, disabled))}</div></div>`
    }
    return html`<div class="group">${name}<div class="buttons">
      ${this.button(id, 'run', entity.attributes.icon ?? 'mdi:gesture-tap-button', entityName(entity), t(this.hass, 'popup.run_again'), disabled)}
    </div></div>`
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.hass?.locale?.language ?? this.hass?.language, { hour: '2-digit', minute: '2-digit' })
  }

  static styles = [tokens, css`
    :host { position: fixed; inset: 0; z-index: 10; display: none; }
    :host([open]) { display: block; }
    .veil { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); animation: fade 0.25s ease both; }
    .sheet {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(720px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; height: auto;
      display: flex; flex-direction: column; gap: 14px; padding: 16px;
      animation: rise 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes fade { from { opacity: 0; } }
    @keyframes rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); } }
    @media (prefers-reduced-motion: reduce) { .veil, .sheet { animation: none; } }
    header { display: flex; align-items: center; gap: 12px; }
    header > ha-icon { --mdc-icon-size: 26px; color: rgb(var(--ad-primary)); }
    .title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .title strong { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title span { font-size: 13px; opacity: 0.6; }
    button { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .close { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: rgba(var(--ad-on-surface), 0.08); }
    .camera {
      position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 4 / 3; max-height: 58dvh;
      display: grid; place-items: center;
    }
    .camera img { width: 100%; height: 100%; object-fit: cover; display: block; }
    /* HA's card around the stream: black like the box, no corners or edge of its own */
    .camera .live {
      position: absolute; inset: 0; display: grid; align-content: center;
      --ha-card-background: #000; --card-background-color: #000; --ha-card-border-radius: 0; --ha-card-border-width: 0;
      --ha-card-box-shadow: none; --ha-card-backdrop-filter: none;
    }
    /* Time until the window closes: runs down from full, starts full again when a tap keeps it open longer */
    .timer { height: 4px; margin-top: -6px; border-radius: 2px; overflow: hidden; background: rgba(var(--ad-on-surface), 0.1); }
    .timer span { display: block; height: 100%; border-radius: 2px; background: rgb(var(--ad-primary)); transform-origin: left; }
    .timer .run { animation: drain var(--ms) linear forwards; }
    @keyframes drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    /* The bell still says someone is there: the window stays, the bar waits full */
    .timer .hold { opacity: 0.5; animation: ad-wait 1.2s ease-in-out infinite alternate; }
    @media (prefers-reduced-motion: reduce) { .timer .hold { animation: none; } }
    .camera .none { color: rgba(255, 255, 255, 0.7); display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .name { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
    .name span:first-child { font-weight: 500; }
    .status { opacity: 0.6; }
    .status.busy { color: rgb(var(--ad-warning)); opacity: 1; }
    .status.failed { color: rgb(var(--ad-error)); opacity: 1; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .act {
      flex: 1 1 140px; min-height: 56px; padding: 0 16px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
      background: rgba(var(--ad-on-surface), 0.08); font-size: 15px; font-weight: 600; text-align: center;
      transition: background 0.2s ease, box-shadow 0.2s ease;
    }
    .act.open { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); flex-basis: 220px; }
    .act.armed { box-shadow: inset 0 0 0 2px rgb(var(--ad-warning)); background: rgba(var(--ad-warning), 0.16); color: rgb(var(--ad-on-surface)); }
    .act[disabled] { opacity: 0.4; cursor: default; }
  `]

  private timer() {
    const c = this.countdown
    if (!c) return nothing
    return html`<div class="timer" aria-hidden="true">${'hold' in c
      ? html`<span class="hold"></span>`
      : keyed(c.until, html`<span class="run" style="--ms: ${c.ms}ms"></span>`)}</div>`
  }

  protected updated() {
    this.toggleAttribute('open', !!this.shown)
  }

  protected render() {
    if (!this.shown || !this.hass) return nothing
    const { popup, at } = this.shown
    const live = popup.camera ? this.liveCard(popup.camera) : undefined
    return html`
      <div class="veil" @click=${() => this.close()}></div>
      <div class="sheet card" role="dialog" aria-modal="true" aria-label=${popup.title} @pointerdown=${this.touch}>
        <header>
          <ha-icon icon=${popup.camera ? 'mdi:doorbell-video' : 'mdi:bell-ring-outline'}></ha-icon>
          <div class="title"><strong>${popup.title}</strong><span>${t(this.hass, 'popup.at', { time: this.time(at) })}</span></div>
          <button class="close" aria-label=${t(this.hass, 'popup.close')} @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
        </header>
        ${this.timer()}
        ${popup.camera ? html`<div class="camera">
          ${this.still ? html`<img src=${this.still} alt="">` : !live ? html`<div class="none"><ha-icon icon="mdi:cctv"></ha-icon></div>` : nothing}
          ${live ? html`<div class="live">${live}</div>` : nothing}
        </div>` : nothing}
        ${popup.actions.map(id => this.action(id))}
      </div>`
  }
}
