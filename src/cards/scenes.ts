// Row of scene and script buttons on Home. A tap runs it and shows a short check, or a cross when HA refused.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { domainOf, entityIcon, entityName, isUnavailable } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface ScenesConfig extends BaseConfig {
  entities: string[]
}

type Feedback = 'ok' | 'error'

export class AdScenes extends BaseCard<ScenesConfig> {
  static properties = { ...BaseCard.properties, feedback: { state: true } }
  feedback: Record<string, Feedback> = {}
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; }
    .row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    .row::-webkit-scrollbar { display: none; }
    button {
      all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; box-sizing: border-box;
      padding: 8px 14px 8px 8px; min-height: 44px; border-radius: 16px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
    }
    :host([glass]) button { background: var(--ad-glass-bg); }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    button[disabled] { cursor: default; opacity: 0.5; }
    .dot { width: 28px; height: 28px; }
    .text { display: flex; flex-direction: column; gap: 1px; }
    .name { font-size: 13px; font-weight: 500; white-space: nowrap; }
    .sub { font-size: 11px; opacity: 0.55; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
    .pulse { width: 6px; height: 6px; border-radius: 50%; background: rgb(var(--ad-primary)); animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.3; } }
    @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearTimeout(this.timer)
  }

  protected watched() {
    return this.config!.entities
  }

  private async run(entity: HassEntity) {
    const id = entity.entity_id
    let result: Feedback = 'ok'
    try {
      await this.call(domainOf(id), 'turn_on', id)
    } catch {
      result = 'error'
    }
    this.feedback = { ...this.feedback, [id]: result }
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => { this.feedback = {} }, 1500)
  }

  /** "vor 5 Min." from a timestamp; scenes keep their last activation as state, scripts in last_triggered. */
  private ago(iso?: string) {
    const time = iso ? Date.parse(iso) : NaN
    if (!Number.isFinite(time)) return undefined
    const minutes = Math.round((time - Date.now()) / 60_000)
    const format = new Intl.RelativeTimeFormat(this.hass!.locale?.language ?? this.hass!.language, { numeric: 'auto', style: 'short' })
    if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
    if (Math.abs(minutes) < 60 * 24) return format.format(Math.round(minutes / 60), 'hour')
    return format.format(Math.round(minutes / 1440), 'day')
  }

  private sub(entity: HassEntity) {
    if (domainOf(entity.entity_id) === 'script' && entity.state === 'on') {
      return html`<span class="pulse"></span>${t(this.hass, 'running')}`
    }
    return this.ago(domainOf(entity.entity_id) === 'scene' ? entity.state : entity.attributes.last_triggered) ?? nothing
  }

  protected render() {
    const entities = this.config!.entities.map(id => this.hass!.states[id]).filter((e): e is HassEntity => !!e)
    return html`<div class="row">
      ${entities.map(entity => {
        const feedback = this.feedback[entity.entity_id]
        const icon = feedback === 'ok' ? 'mdi:check' : feedback === 'error' ? 'mdi:alert-circle-outline'
          : this.hass!.entities[entity.entity_id]?.icon ?? entity.attributes.icon ?? entityIcon(entity)
        const color = feedback === 'ok' ? 'success' : feedback === 'error' ? 'error' : ''
        return html`<button ?disabled=${isUnavailable(entity) || !this.canControl(entity.entity_id)}
          @click=${() => this.run(entity)}>
          <span class="dot ${color}"><ha-icon icon=${icon}></ha-icon></span>
          <span class="text"><span class="name">${entityName(entity)}</span><span class="sub">${this.sub(entity)}</span></span>
        </button>`
      })}
    </div>`
  }
}
