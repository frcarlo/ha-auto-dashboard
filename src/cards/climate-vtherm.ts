// @ts-nocheck
// Versatile Thermostat: simplified for Danfoss TRV with controls
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { entityName, isUnavailable } from '../presentation'
import { materials } from '../styles/materials'
import { tokens } from '../styles/tokens'

interface ClimateVthermConfig extends BaseConfig {
  entity: string
  temperature_entity?: string
  follow_switch?: string
  window_entity?: string
  ema_temperature?: string
  valve_opening?: string
  temp_change_rate?: string
  room?: string
  path?: string
}

const degree = (unit: string) => (/^°[CF]$/.test(unit) ? '°' : unit)

export class AdClimateVtherm extends BaseCard<ClimateVthermConfig> {
  static styles = [tokens, materials, css`
    :host { display: block; }
    .card { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; align-items: center; gap: 8px; font-size: var(--ad-fs-m); font-weight: 500; cursor: pointer; }
    .head ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); }

    .target { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .value { font-size: 2rem; font-weight: 300; letter-spacing: -0.03em; }
    .value small { font-size: 1.2rem; opacity: var(--ad-o2); margin-left: 2px; }
    .heating { color: rgb(var(--ad-warning)); }

    .btns { display: flex; gap: 12px; align-items: center; justify-content: center; }
    .btn { width: 32px; height: 32px; border: none; border-radius: 8px; background: rgba(var(--ad-on-surface), 0.08); cursor: pointer; font-weight: 600; }
    .btn:hover { background: rgba(var(--ad-on-surface), 0.12); }

    .controls { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-bottom: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
    .label { opacity: var(--ad-o2); }

    .toggle { width: 48px; height: 24px; background: rgba(var(--ad-on-surface), 0.2); border: none; border-radius: 12px; cursor: pointer; position: relative; }
    .toggle.on { background: rgb(var(--ad-primary)); }
    .toggle::before { content: ''; position: absolute; width: 20px; height: 20px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: left 200ms; }
    .toggle.on::before { left: 26px; }

    .sensors { font-size: var(--ad-fs-s); display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
    .sensor { display: flex; justify-content: space-between; padding: 4px 0; }
    .sensor .name { opacity: var(--ad-o2); }
  `]

  private send(ent: string, temp: number) {
    if (this.hass) this.hass.callService('climate', 'set_temperature', { entity_id: ent, temperature: temp })
  }

  render() {
    if (!this.hass) return nothing
    const st = this.hass.states as any
    const c = st[this.config.entity]
    if (!c || isUnavailable(c)) return html`<div class="card"><em>unavailable</em></div>`

    const current = Number(c.state) || Number(c.attributes?.current_temperature) || 0
    const target = Number(c.attributes?.temperature) || 20
    const unit = c.attributes?.temperature_unit || '°C'
    const heating = c.attributes?.hvac_action === 'heating'

    const te = this.config.temperature_entity ? st[this.config.temperature_entity] : null
    const fe = this.config.follow_switch ? st[this.config.follow_switch] : null
    const we = this.config.window_entity ? st[this.config.window_entity] : null
    const ee = this.config.ema_temperature ? st[this.config.ema_temperature] : null
    const ve = this.config.valve_opening ? st[this.config.valve_opening] : null
    const re = this.config.temp_change_rate ? st[this.config.temp_change_rate] : null

    const wopen = we?.state === 'on'
    const fon = fe?.state === 'on'

    return html`
      <div class="card">
        ${this.config.room ? html`<div class="head">${this.config.room}</div>` : nothing}

        <div class="target">
          <div class="value ${heating ? 'heating' : ''}">
            ${current.toFixed(1)}<small>${degree(unit)}</small>
          </div>
          <div class="btns">
            <button class="btn" @click=${() => this.send(this.config.entity, target - 0.5)}>−</button>
            <div style="text-align:center; min-width: 60px;">
              <div style="opacity: var(--ad-o2); font-size: var(--ad-fs-s);">Soll</div>
              <div style="font-weight: 500;">${target.toFixed(1)}${degree(unit)}</div>
            </div>
            <button class="btn" @click=${() => this.send(this.config.entity, target + 0.5)}>+</button>
          </div>
        </div>

        <div class="controls">
          ${fe ? html`
            <div class="row">
              <span class="label">${entityName(fe)}</span>
              <button class="toggle ${fon ? 'on' : ''}" @click=${() => fe && this.hass?.callService('switch', 'turn_' + (fon ? 'off' : 'on'), { entity_id: this.config.follow_switch })}></button>
            </div>
          ` : nothing}

          ${we ? html`
            <div class="row">
              <span class="label">${t(this.hass, 'window')}</span>
              <span style=${wopen ? 'color: rgb(var(--ad-warning))' : 'opacity: var(--ad-o2)'}>${wopen ? 'Offen' : 'Zu'}</span>
            </div>
          ` : nothing}
        </div>

        ${te || ee || ve || re ? html`
          <div class="sensors">
            ${te ? html`<div class="sensor"><span class="name">EMA-Temperatur</span> <span>${te.state}${degree(te.attributes?.unit_of_measurement)}</span></div>` : nothing}
            ${ve ? html`<div class="sensor"><span class="name">Ventilöffnung</span> <span>${ve.state}${degree(ve.attributes?.unit_of_measurement)}</span></div>` : nothing}
            ${ee ? html`<div class="sensor"><span class="name">Geregelte Temp</span> <span>${ee.state}${degree(ee.attributes?.unit_of_measurement)}</span></div>` : nothing}
            ${re ? html`<div class="sensor"><span class="name">Änderungsrate</span> <span>${re.state}${degree(re.attributes?.unit_of_measurement)}</span></div>` : nothing}
          </div>
        ` : nothing}
      </div>
    `
  }
}

customElements.define('ad-climate-vtherm', AdClimateVtherm)
