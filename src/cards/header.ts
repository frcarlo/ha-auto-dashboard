import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { domainOf, isActive } from '../presentation'
import { tokens } from '../styles/tokens'

interface HeaderAction {
  label: 'all_off' | 'all_close'
  icon: string
  service: string
}

interface HeaderConfig extends BaseConfig {
  variant?: 'home' | 'page'
  title?: string
  /** Rooms or floors the dashboard is filtered to, shown next to the date */
  scope?: string
  icon?: string
  /** Entities counted in the subtitle and targeted by the action */
  entities?: string[]
  count_label?: 'n_on' | 'n_open'
  action?: HeaderAction
}

export class AdHeader extends BaseCard<HeaderConfig> {
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    .wrap { display: flex; align-items: flex-end; gap: 12px; padding: 8px 4px 4px; }
    .text { flex: 1; min-width: 0; }
    .eyebrow { font-size: 12px; opacity: 0.55; letter-spacing: 0.03em; }
    h1 { margin: 2px 0 0; font-size: 28px; font-weight: 300; letter-spacing: -0.03em; line-height: 1.15; }
    h1 ha-icon { --mdc-icon-size: 26px; opacity: 0.5; margin-right: 6px; vertical-align: -3px; }
    .clock { font-size: 40px; font-weight: 200; letter-spacing: -0.05em; line-height: 1; }
    .weather { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.75; }
    .weather ha-icon { --mdc-icon-size: 22px; }
    .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .action {
      all: unset; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px; cursor: pointer;
      border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow); font-size: 13px;
    }
    .action ha-icon { --mdc-icon-size: 17px; opacity: 0.7; }
    .action:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    @container (max-width: 480px) {
      h1 { font-size: 24px; }
      .clock { font-size: 30px; }
      .weather { font-size: 12px; }
      .weather .cond { display: none; }
    }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.config?.variant !== 'page') this.timer = window.setInterval(() => this.requestUpdate(), 15_000)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
  }

  private get weather() {
    return Object.values(this.hass!.states).find(e => domainOf(e.entity_id) === 'weather')
  }

  protected watched() {
    return [...(this.config!.entities ?? []), ...(this.weather ? [this.weather.entity_id] : [])]
  }

  private greeting(hour: number) {
    if (hour < 5 || hour >= 23) return t(this.hass, 'night')
    if (hour < 11) return t(this.hass, 'morning')
    if (hour < 18) return t(this.hass, 'day')
    return t(this.hass, 'evening')
  }

  protected render() {
    return this.config!.variant === 'page' ? this.renderPage() : this.renderHome()
  }

  private renderHome() {
    const now = new Date()
    const lang = this.hass!.locale?.language ?? this.hass!.language
    const name = this.hass!.user?.name?.split(' ')[0]
    const weather = this.weather
    return html`<div class="wrap">
      <div class="text">
        <div class="eyebrow">${now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}${this.config!.scope ? ` · ${this.config!.scope}` : ''}${this.config!.access === 'read_only' ? ` · ${t(this.hass, 'view_only')}` : ''}</div>
        <h1>${this.greeting(now.getHours())}${name ? `, ${name}` : ''}</h1>
      </div>
      <div class="right">
        <span class="clock">${now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</span>
        ${weather ? html`<span class="weather" role="button" tabindex="0" @click=${() => this.moreInfo(weather.entity_id)}>
          <ha-state-icon .hass=${this.hass} .stateObj=${weather}></ha-state-icon>
          ${this.number(weather.attributes.temperature, 0)}${weather.attributes.temperature_unit ?? '°'}
          <span class="cond">· ${this.hass!.formatEntityState?.(weather) ?? weather.state}</span>
        </span>` : nothing}
      </div>
    </div>`
  }

  private renderPage() {
    const c = this.config!
    const entities = (c.entities ?? []).map(id => this.hass!.states[id]).filter(e => !!e)
    const active = entities.filter(e => domainOf(e.entity_id) === 'lock' ? !isActive(e) : isActive(e))
    return html`<div class="wrap">
      <div class="text">
        ${c.count_label ? html`<div class="eyebrow">${t(this.hass, c.count_label, { n: active.length })}</div>` : nothing}
        <h1>${c.icon ? html`<ha-icon icon=${c.icon}></ha-icon>` : nothing}${c.title}</h1>
      </div>
      ${c.action && active.length && (c.access ?? 'full') === 'full' ? html`<button class="action"
        @click=${() => this.call(domainOf(active[0]!.entity_id), c.action!.service, active.map(e => e.entity_id))}>
        <ha-icon icon=${c.action.icon}></ha-icon>${t(this.hass, c.action.label)}
      </button>` : nothing}
    </div>`
  }
}
