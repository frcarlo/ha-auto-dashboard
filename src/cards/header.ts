import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { entityIndex } from '../model'
import { domainOf, entityName, isActive } from '../presentation'
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
  /** Entities counted in the subtitle and targeted by the action */
  entities?: string[]
  count_label?: 'n_on' | 'n_open'
  action?: HeaderAction
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

const ALARM_ICONS: Record<string, string> = {
  disarmed: 'mdi:shield-off-outline',
  triggered: 'mdi:bell-ring',
  arming: 'mdi:shield-sync-outline',
  pending: 'mdi:shield-sync-outline',
}

/** Triggered is red and pulses, armed blue, disarmed green, arming or pending grey. */
function alarmColor(state: string) {
  if (state === 'triggered') return 'error'
  if (state.startsWith('armed')) return 'info'
  if (state === 'disarmed') return 'success'
  return ''
}

export class AdHeader extends BaseCard<HeaderConfig> {
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    .wrap { display: flex; align-items: flex-end; gap: 12px; padding: 8px 4px 4px; }
    .text { flex: 1; min-width: 0; }
    .eyebrow { font-size: 12px; opacity: 0.55; letter-spacing: 0.03em; }
    h1 { margin: 2px 0 0; font-size: 28px; font-weight: 300; letter-spacing: -0.03em; line-height: 1.15; }
    /* A page's count sits under its title, as quiet as the date above the greeting */
    .meta { margin-top: 4px; font-size: 13px; opacity: 0.55; font-variant-numeric: tabular-nums; }
    .clock { font-size: 40px; font-weight: 200; letter-spacing: -0.05em; line-height: 1; }
    .weather { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.75; }
    .weather ha-icon { --mdc-icon-size: 22px; }
    .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .action {
      all: unset; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px; cursor: pointer;
      border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow); font-size: 13px;
    }
    .action ha-icon { --mdc-icon-size: 17px; opacity: 0.7; }
    .people { display: flex; align-items: center; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    .person {
      all: unset; position: relative; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; flex: 0 0 auto;
      display: grid; place-items: center; font-size: 12px; font-weight: 600;
      background: center / cover var(--ad-surface-variant);
    }
    .person.away { filter: grayscale(1); opacity: 0.55; }
    .person::after {
      content: ''; position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%;
      background: rgb(var(--ad-success)); box-shadow: 0 0 0 2px var(--ad-bg);
    }
    .person.away::after { background: rgba(var(--ad-on-surface), 0.4); }
    .person:focus-visible, .alarm:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .alarm {
      all: unset; display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px 5px 8px; margin-left: 4px; cursor: pointer;
      border-radius: 999px; font-size: 12px; background: rgba(var(--ad-on-surface), 0.08);
    }
    .alarm ha-icon { --mdc-icon-size: 16px; }
    .alarm.success ha-icon { color: rgb(var(--ad-success)); }
    .alarm.info { background: rgba(var(--ad-info), 0.16); }
    .alarm.info ha-icon { color: rgb(var(--ad-info)); }
    .alarm.error { background: rgb(var(--ad-error)); color: #fff; animation: alarm 1s ease-in-out infinite; }
    @keyframes alarm { 50% { opacity: 0.55; } }
    @media (prefers-reduced-motion: reduce) { .alarm.error { animation: none; } }
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

  /** People and the alarm panel follow the dashboard's hide options; rooms don't matter for them. */
  private visible(domain: string) {
    if (this.config!.hide_domains?.includes(domain)) return []
    return entityIndex(this.hass!, this.config!.hide_labels).all
      .filter(id => domainOf(id) === domain && !this.config!.hide_entities?.includes(id))
      .map(id => this.hass!.states[id]!)
      .filter(Boolean)
  }

  protected watched() {
    const home = this.config!.variant !== 'page'
    return [
      ...(this.config!.entities ?? []),
      ...(this.weather ? [this.weather.entity_id] : []),
      ...(home ? [...this.visible('person'), ...this.visible('alarm_control_panel')].map(e => e.entity_id) : []),
    ]
  }

  private renderPeople() {
    const people = this.visible('person')
    const alarm = this.visible('alarm_control_panel')[0]
    if (!people.length && !alarm) return nothing
    return html`<div class="people">
      ${people.map(p => {
        const home = p.state === 'home'
        const picture = p.attributes.entity_picture as string | undefined
        const name = entityName(p)
        const where = home ? t(this.hass, 'home_state') : p.state === 'not_home' ? t(this.hass, 'away') : this.hass!.formatEntityState?.(p) ?? p.state
        return html`<button class="person ${home ? '' : 'away'}" title="${name}: ${where}" aria-label="${name}: ${where}"
          style=${picture ? `background-image:url('${picture}')` : ''} @click=${() => this.moreInfo(p.entity_id)}>
          ${picture ? nothing : name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </button>`
      })}
      ${alarm ? html`<button class="alarm ${alarmColor(alarm.state)}" @click=${() => this.moreInfo(alarm.entity_id)}>
        <ha-icon icon=${ALARM_ICONS[alarm.state] ?? 'mdi:shield-lock'}></ha-icon>${this.hass!.formatEntityState?.(alarm) ?? alarm.state}
      </button>` : nothing}
    </div>`
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
        ${this.renderPeople()}
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
        <h1>${c.title}</h1>
        ${c.count_label ? html`<div class="meta">${t(this.hass, c.count_label, { n: active.length })}</div>` : nothing}
      </div>
      ${c.action && active.length && (c.access ?? 'full') === 'full' ? html`<button class="action"
        @click=${() => this.call(domainOf(active[0]!.entity_id), c.action!.service, active.map(e => e.entity_id))}>
        <ha-icon icon=${c.action.icon}></ha-icon>${t(this.hass, c.action.label)}
      </button>` : nothing}
    </div>`
  }
}
