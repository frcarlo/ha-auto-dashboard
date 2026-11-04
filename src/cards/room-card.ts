// Port of HArmony's RoomCardWidget.vue, fed from the area instead of hand-picked entities.
import { css, html, nothing } from 'lit'
import { BaseCard, gestures, type BaseConfig } from './base'
import { areaEntities, entityIndex, roomSummary, type RoomSummary } from '../model'
import { HVAC_ICONS, entityIcon, entityName, hvacColor, isActive, isUnavailable, stateColor } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface RoomCardConfig extends BaseConfig {
  area: string
  /** View path of the room page */
  path?: string
  hide_domains?: string[]
}

export class AdRoomCard extends BaseCard<RoomCardConfig> {
  static styles = [tokens, css`
    /* Fill the grid rows HA reserves (getGridOptions), not just the content height */
    :host { display: block; height: 100%; container-type: inline-size; }
    .card { display: flex; gap: 8px; padding: 12px; cursor: pointer; user-select: none; }
    .card.lit { background: color-mix(in srgb, rgb(var(--ad-warning)) 14%, var(--ad-surface)); filter: drop-shadow(0 1px 3px rgba(0,0,0,.15)); }
    .card.lit::before {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      background: radial-gradient(ellipse 120% 90% at 0% 0%, rgba(var(--ad-warning), 0.28) 0%, transparent 70%);
    }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
    .dots { display: flex; gap: 4px; overflow: hidden; }
    .values { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
    .values > * { flex-shrink: 0; }
    .values > ha-icon { --mdc-icon-size: 18px; opacity: 0.6; }
    .temp { font-size: 1.2rem; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
    .chip {
      all: unset; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px 2px 5px; cursor: pointer;
      border-radius: 999px; font-size: 11px; background: rgba(var(--ad-on-surface), 0.08); white-space: nowrap;
    }
    .chip ha-icon { --mdc-icon-size: 13px; opacity: 0.7; }
    .room { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.75; }
    .lit .room { opacity: 0.9; }
    .temp-ctl { display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
    .temp-ctl .target { font-size: 12px; font-weight: 500; }
    .temp-ctl .btn { width: 28px; height: 28px; }
    /* Narrow cards (phones, 4-up rows) drop the ± column; the climate dot still opens more-info */
    @container (max-width: 170px) {
      .temp-ctl { display: none; }
      .temp { font-size: 1.05rem; }
    }
  `]

  private tap = gestures({
    tap: () => this.config?.path && this.navigate(this.config.path),
    double: () => this.toggleLights(),
  })

  getGridOptions() {
    return { columns: 6, rows: 2, min_columns: 4, min_rows: 2 }
  }

  protected watched() {
    return entityIndex(this.hass!).byArea.get(this.config!.area) ?? []
  }

  private get summary() {
    return roomSummary(areaEntities(this.hass!, this.config!.area, this.config!.hide_domains))
  }

  private toggleLights() {
    const lights = this.summary.lights.filter(l => !isUnavailable(l))
    if (!lights.length) return
    const anyOn = lights.some(l => l.state === 'on')
    this.call('light', anyOn ? 'turn_off' : 'turn_on', lights.map(l => l.entity_id))
  }

  private dot(entity: HassEntity, icon: string, color: string, title: string) {
    return html`<button class="dot ${color}" title=${title} aria-label=${title}
      @pointerdown=${(e: Event) => e.stopPropagation()}
      @click=${(e: Event) => { e.stopPropagation(); this.moreInfo(entity.entity_id) }}>
      <ha-icon icon=${icon}></ha-icon>
    </button>`
  }

  private chip(entity: HassEntity | undefined) {
    if (!entity) return nothing
    const { value, unit } = this.value(entity)
    return html`<button class="chip" @pointerdown=${(e: Event) => e.stopPropagation()}
      @click=${(e: Event) => { e.stopPropagation(); this.moreInfo(entity.entity_id) }}>
      <ha-icon icon=${entityIcon(entity)}></ha-icon>${value}${unit}
    </button>`
  }

  /** Room for four dots next to the ± column; active ones (open window, unlocked door) win. */
  private statusDots(s: RoomSummary, climate?: HassEntity) {
    const free = 4 - (s.lights.length ? 1 : 0) - (climate ? 1 : 0)
    const alerting = (e: HassEntity) => e.entity_id.startsWith('lock.') ? !isActive(e) : isActive(e)
    return [...s.status].sort((a, b) => Number(alerting(b)) - Number(alerting(a))).slice(0, Math.max(free, 0))
  }

  protected render() {
    const area = this.hass!.areas[this.config!.area]
    if (!area) return nothing
    const s = this.summary
    const lit = s.lights.some(l => l.state === 'on')
    const climate = s.climate
    const current = climate?.attributes.current_temperature as number | undefined
    const target = climate?.attributes.temperature as number | undefined
    const step = (climate?.attributes.target_temp_step as number | undefined) ?? 0.5
    const climateOk = climate && !isUnavailable(climate) && target !== undefined
    const lightsOn = s.lights.filter(l => l.state === 'on').length

    return html`<div class="card ${lit ? 'lit' : ''}" role="button" tabindex="0" aria-label=${area.name}
      @pointerdown=${this.tap.down} @pointerup=${this.tap.up} @pointerleave=${this.tap.up}
      @click=${this.tap.click}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.config!.path && this.navigate(this.config!.path)}>
      <div class="main">
        <div class="dots">
          ${s.lights.length ? this.dot(s.lights[0]!, lit ? 'mdi:lightbulb' : 'mdi:lightbulb-outline', lit ? 'warning' : '',
            s.lights.length > 1 ? `${lightsOn}/${s.lights.length}` : entityName(s.lights[0])) : nothing}
          ${climate ? this.dot(climate, HVAC_ICONS[climate.state] ?? 'mdi:thermostat', hvacColor(climate.state) === 'muted' ? '' : hvacColor(climate.state),
            this.hass!.formatEntityState?.(climate) ?? climate.state) : nothing}
          ${this.statusDots(s, climate).map(e => {
            const active = isActive(e)
            // A locked lock is the calm state, so only an open lock gets a color
            const color = e.entity_id.startsWith('lock.') ? (active ? '' : 'warning') : (active ? stateColor(e, true) : '')
            return this.dot(e, entityIcon(e, active), color, `${entityName(e)}: ${this.hass!.formatEntityState?.(e) ?? e.state}`)
          })}
        </div>
        <div class="values">
          ${current !== undefined
            ? html`<ha-icon icon="mdi:thermometer"></ha-icon><span class="temp">${this.number(current)}°C</span>`
            : s.temperature ? html`<ha-icon icon="mdi:thermometer"></ha-icon><span class="temp">${this.value(s.temperature).value}${this.value(s.temperature).unit}</span>` : nothing}
          ${this.chip(s.humidity)}
          ${this.chip(s.co2)}
        </div>
        <span class="room">${area.name}</span>
      </div>
      ${climate ? html`<div class="temp-ctl" @pointerdown=${(e: Event) => e.stopPropagation()} @click=${(e: Event) => e.stopPropagation()}>
        <button class="btn" ?disabled=${!climateOk} aria-label="+"
          @click=${() => this.call('climate', 'set_temperature', climate.entity_id, { temperature: Math.round((target! + step) / step) * step })}>
          <ha-icon icon="mdi:plus"></ha-icon></button>
        <span class="target">${target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'}</span>
        <button class="btn" ?disabled=${!climateOk} aria-label="-"
          @click=${() => this.call('climate', 'set_temperature', climate.entity_id, { temperature: Math.round((target! - step) / step) * step })}>
          <ha-icon icon="mdi:minus"></ha-icon></button>
      </div>` : nothing}
    </div>`
  }
}
