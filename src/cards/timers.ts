// A room's timers as a row of buttons, like its scenes: "5 min", "10 min", "1 h". The first tap asks, the second
// starts it; a running one counts down in its button, with pause or resume and cancel beside it.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { timerLeft } from '../model'
import { entityName, isUnavailable } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'
import { scrollRow } from '../scroll-row'

interface TimersConfig extends BaseConfig {
  entities: string[]
}

/** "0:10:00" as milliseconds */
export function durationMs(text: unknown): number | undefined {
  const parts = String(text ?? '').split(':').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return undefined
  return ((parts[0]! * 60 + parts[1]!) * 60 + parts[2]!) * 1000
}

/** "10 min", "1 h", "1 h 30 min", "45 s": how long a timer runs, said short */
export function durationLabel(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

/** "3:20", or "1:02:03" from an hour on */
export function countdown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/**
 * The button's name: a timer named after its length ("Timer 10 Minuten") goes by the length, "10 min";
 * one with a name of its own ("Nudeln") keeps it.
 */
export function timerName(entity: HassEntity): { name: string; length?: string } {
  const ms = durationMs(entity.attributes.duration)
  const length = ms ? durationLabel(ms) : undefined
  const name = entityName(entity)
  if (length && /^timer\b/i.test(name.trim())) return { name: length }
  return { name, ...(length ? { length } : {}) }
}

export class AdTimers extends BaseCard<TimersConfig> {
  static properties = { ...BaseCard.properties, armed: { state: true }, now: { state: true } }
  /** The timer waiting for its second tap */
  armed?: string
  now = Date.now()
  private armTimer?: number
  private tick?: number

  static styles = [tokens, css`
    :host { display: block; }
    .row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    .row::-webkit-scrollbar { display: none; }
    .timer {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 4px; border-radius: 16px; min-height: 44px; box-sizing: border-box;
      background: var(--ad-surface); box-shadow: var(--ad-shadow);
    }
    :host([glass]) .timer { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .timer.running { box-shadow: inset 0 0 0 2px rgba(var(--ad-primary), 0.6); }
    .timer.armed { box-shadow: inset 0 0 0 2px rgb(var(--ad-primary)); }
    .main { all: unset; display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; cursor: pointer; border-radius: 12px; }
    .main:focus-visible, .mini:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .main[disabled] { cursor: default; opacity: 0.5; }
    .dot { width: 28px; height: 28px; }
    .running .dot { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .text { display: flex; flex-direction: column; gap: 1px; }
    .name { font-size: var(--ad-fs-s); font-weight: 500; white-space: nowrap; }
    .sub { font-size: var(--ad-fs-xs); opacity: var(--ad-o2); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .running .sub { opacity: 1; font-weight: 500; color: rgb(var(--ad-primary)); }
    .armed .sub { color: rgb(var(--ad-primary)); opacity: 1; font-weight: 500; }
    .mini {
      all: unset; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 16px; cursor: pointer;
      background: rgba(var(--ad-on-surface), 0.08);
    }
    .mini:hover { background: rgba(var(--ad-on-surface), 0.14); }
    .mini ha-icon { --mdc-icon-size: 16px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  protected watched() {
    return this.config!.entities
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearTimeout(this.armTimer)
    window.clearInterval(this.tick)
    this.tick = undefined
    this.armed = undefined
  }

  protected updated() {
    // A running timer counts down by the second; without one nothing ticks
    const running = this.timers.some(e => e.state === 'active')
    if (running && !this.tick) this.tick = window.setInterval(() => (this.now = Date.now()), 1000)
    if (!running && this.tick) {
      window.clearInterval(this.tick)
      this.tick = undefined
    }
  }

  /** The room's timers, shortest first */
  private get timers() {
    return this.config!.entities.map(id => this.hass!.states[id]).filter((e): e is HassEntity => !!e)
      .sort((a, b) => (durationMs(a.attributes.duration) ?? 0) - (durationMs(b.attributes.duration) ?? 0))
  }

  /** Starting one is the second tap, so a brush against the screen starts nothing */
  private tap(entity: HassEntity) {
    window.clearTimeout(this.armTimer)
    if (this.armed === entity.entity_id) {
      this.armed = undefined
      return this.call('timer', 'start', entity.entity_id)
    }
    this.armed = entity.entity_id
    this.armTimer = window.setTimeout(() => { this.armed = undefined }, 4000)
  }

  private button(entity: HassEntity) {
    const id = entity.entity_id
    const running = entity.state === 'active' || entity.state === 'paused'
    const paused = entity.state === 'paused'
    const armed = this.armed === id
    const left = running ? timerLeft(entity, this.now) : undefined
    const { name, length } = timerName(entity)
    const sub = armed ? t(this.hass, 'run.again_long')
      : running ? `${left !== undefined ? countdown(left) : ''}${paused ? ` · ${t(this.hass, 'timer.paused')}` : ''}`
      : length
    const allowed = this.canControl(id) && !isUnavailable(entity)
    return html`<div class="timer ${running ? 'running' : ''} ${armed ? 'armed' : ''}">
      <button class="main" ?disabled=${!allowed} title=${entityName(entity)}
        @click=${() => (running ? this.moreInfo(id) : this.tap(entity))}>
        <span class="dot"><ha-icon icon=${paused ? 'mdi:timer-pause-outline' : running ? 'mdi:timer-sand' : 'mdi:timer-outline'}></ha-icon></span>
        <span class="text"><span class="name">${name}</span>${sub ? html`<span class="sub">${sub}</span>` : nothing}</span>
      </button>
      ${running && allowed ? html`
        <button class="mini" aria-label=${t(this.hass, paused ? 'timer.resume' : 'timer.pause')} @click=${() => this.call('timer', paused ? 'start' : 'pause', id)}>
          <ha-icon icon=${paused ? 'mdi:play' : 'mdi:pause'}></ha-icon></button>
        <button class="mini" aria-label=${t(this.hass, 'timer.cancel')} @click=${() => this.call('timer', 'cancel', id)}>
          <ha-icon icon="mdi:close"></ha-icon></button>` : nothing}
    </div>`
  }

  protected render() {
    return html`<div class="row" ${scrollRow()}>${this.timers.map(e => this.button(e))}</div>`
  }
}
