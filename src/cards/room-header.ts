// Top of a room page: name, temperature and humidity, a thermostat when the room has one,
// and quick tiles that switch all lights, all switches or all covers of the room.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { canBulk } from '../access'
import { areaEntities, entityIndex, quickGroups, roomSummary, type QuickKey } from '../model'
import { HVAC_ICONS, domainOf, hvacColor, isActive, isUnavailable } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface RoomHeaderConfig extends BaseConfig {
  area: string
  hide_domains?: string[]
  hide_labels?: string[]
}

const QUICK_ICONS: Record<QuickKey, [on: string, off: string]> = {
  light: ['mdi:lightbulb-group', 'mdi:lightbulb-group-outline'],
  switch: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'],
  cover: ['mdi:window-shutter-open', 'mdi:window-shutter'],
}

const HVAC_ACTIONS = ['heating', 'cooling', 'drying', 'fan', 'idle', 'off']

/** Taps on −/+ are collected and sent as one set_temperature after this pause. */
const SEND_DELAY = 700

export class AdRoomHeader extends BaseCard<RoomHeaderConfig> {
  static properties = { ...BaseCard.properties, pending: { state: true } }
  /** Target temperature tapped in but not yet confirmed by HA */
  pending?: number
  private sendTimer?: number

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    .wrap { padding: 8px 4px 4px; display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; align-items: flex-end; gap: 12px; }
    h1 { flex: 1; min-width: 0; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: -0.03em; line-height: 1.15; }
    h1 ha-icon { --mdc-icon-size: 26px; opacity: 0.5; margin-right: 6px; vertical-align: -3px; }
    .values { display: flex; gap: 6px; }
    .value {
      all: unset; display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px 4px 7px; cursor: pointer;
      border-radius: 999px; background: rgba(var(--ad-on-surface), 0.08); font-size: 13px; white-space: nowrap;
    }
    .value ha-icon { --mdc-icon-size: 16px; opacity: 0.65; }
    .row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    .row::-webkit-scrollbar { display: none; }
    .tile {
      flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 52px; box-sizing: border-box;
      border-radius: 18px; background: var(--ad-surface); box-shadow: var(--ad-shadow); cursor: pointer; user-select: none;
      transition: background 0.3s ease;
    }
    :host([glass]) .tile { background: var(--ad-glass-bg); }
    .tile.on { background: color-mix(in srgb, rgb(var(--ad-warning)) 16%, var(--ad-surface)); }
    .tile.static { cursor: default; }
    .tile:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .tile .text { display: flex; flex-direction: column; gap: 1px; }
    .tile .label { font-size: 13px; font-weight: 500; }
    .tile .sub { font-size: 12px; opacity: 0.6; white-space: nowrap; }
    .tile .btn { width: 30px; height: 30px; }
    .thermo { gap: 12px; }
    .thermo .now { font-size: 24px; font-weight: 300; letter-spacing: -0.03em; }
    .thermo .set { display: flex; align-items: center; gap: 6px; }
    .thermo .target { min-width: 44px; text-align: center; font-size: 15px; font-weight: 500; }
    .thermo .target.pending { opacity: 0.6; }
    .mode { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.75; }
    .mode ha-icon { --mdc-icon-size: 14px; }
    .mode.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .mode.info { color: rgb(var(--ad-info)); opacity: 1; }
    @container (max-width: 480px) {
      h1 { font-size: 24px; }
      .top { flex-direction: column; align-items: flex-start; gap: 8px; }
    }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 2
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearTimeout(this.sendTimer)
  }

  private get roomEntities() {
    return areaEntities(this.hass!, this.config!.area, { domains: this.config!.hide_domains, labels: this.config!.hide_labels })
  }

  protected watched() {
    const area = this.hass!.areas[this.config!.area]
    return [
      ...(entityIndex(this.hass!, this.config!.hide_labels).byArea.get(this.config!.area) ?? []),
      ...[area?.temperature_entity_id, area?.humidity_entity_id].filter((id): id is string => !!id),
    ]
  }

  protected willUpdate() {
    super.willUpdate()
    // HA caught up with the tapped target
    const climate = this.thermostat
    if (this.pending !== undefined && !this.sendTimer && climate?.attributes.temperature === this.pending) this.pending = undefined
  }

  /** The thermostat in the header: only when the room has exactly one usable climate entity. */
  private get thermostat() {
    const climates = this.roomEntities.filter(e => domainOf(e.entity_id) === 'climate')
    return climates.length === 1 && !isUnavailable(climates[0]!) ? climates[0] : undefined
  }

  private nudge(climate: HassEntity, direction: number) {
    const a = climate.attributes
    const step = (a.target_temp_step as number | undefined) ?? 0.5
    const base = this.pending ?? (a.temperature as number)
    const next = Math.min(a.max_temp ?? Infinity, Math.max(a.min_temp ?? -Infinity, Math.round((base + direction * step) / step) * step))
    this.pending = next
    window.clearTimeout(this.sendTimer)
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = undefined
      Promise.resolve(this.call('climate', 'set_temperature', climate.entity_id, { temperature: next }))
        .catch(() => { this.pending = undefined })
    }, SEND_DELAY)
  }

  private valueChip(entity: HassEntity | undefined, icon: string) {
    if (!entity) return nothing
    const { value, unit } = this.value(entity)
    return html`<button class="value" @click=${() => this.moreInfo(entity.entity_id)}><ha-icon icon=${icon}></ha-icon>${value}${unit}</button>`
  }

  private renderThermostat(climate: HassEntity) {
    const a = climate.attributes
    const target = this.pending ?? (a.temperature as number | undefined)
    const action = (a.hvac_action as string | undefined) ?? climate.state
    const color = hvacColor(action === 'heating' ? 'heat' : action === 'cooling' ? 'cool' : action)
    const label = HVAC_ACTIONS.includes(action) ? t(this.hass, `hvac.${action}` as Key) : this.hass!.formatEntityState?.(climate) ?? action
    // heat_cool with a range, or off: show values only, like Dwains
    const adjustable = target !== undefined && this.canControl(climate.entity_id)
    return html`<div class="tile thermo static">
      <span class="now" role="button" tabindex="0" @click=${() => this.moreInfo(climate.entity_id)}>${this.number(a.current_temperature)}°</span>
      <div class="text">
        <span class="mode ${color}"><ha-icon icon=${HVAC_ICONS[climate.state] ?? 'mdi:thermostat'}></ha-icon>${label}</span>
        <div class="set">
          ${adjustable ? html`<button class="btn" aria-label="-" @click=${() => this.nudge(climate, -1)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
          <span class="target ${this.pending !== undefined ? 'pending' : ''}" title=${t(this.hass, 'target')}>
            ${target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'}</span>
          ${adjustable ? html`<button class="btn" aria-label="+" @click=${() => this.nudge(climate, 1)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
        </div>
      </div>
    </div>`
  }

  private renderQuick(key: QuickKey, all: HassEntity[]) {
    const entities = all.filter(e => !isUnavailable(e))
    const ids = entities.map(e => e.entity_id)
    const active = entities.filter(e => isActive(e))
    const allowed = canBulk(this.config!.access, ids) && ids.every(id => this.canControl(id))
    const label = t(this.hass, `quick.${key}`)
    const sub = key === 'cover'
      ? t(this.hass, 'n_open', { n: active.length })
      : entities.length > 1 ? t(this.hass, 'n_of_on', { n: active.length, total: entities.length }) : (active.length ? t(this.hass, 'on') : t(this.hass, 'off'))
    const icon = QUICK_ICONS[key][active.length ? 0 : 1]
    const content = html`<span class="dot ${active.length ? 'warning' : ''}"><ha-icon icon=${icon}></ha-icon></span>
      <div class="text"><span class="label">${label}</span><span class="sub">${sub}</span></div>`

    if (key === 'cover') {
      return html`<div class="tile static ${active.length ? 'on' : ''}">${content}
        ${allowed ? html`
          <button class="btn" aria-label=${t(this.hass, 'all_open')} @click=${() => this.call('cover', 'open_cover', ids)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="btn" aria-label=${t(this.hass, 'all_close')} @click=${() => this.call('cover', 'close_cover', ids)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>` : nothing}
      </div>`
    }
    // Something on: switch those off. All off: switch everything on.
    const toggle = () => allowed && this.call('homeassistant', active.length ? 'turn_off' : 'turn_on', active.length ? active.map(e => e.entity_id) : ids)
    return html`<div class="tile ${active.length ? 'on' : ''} ${allowed ? '' : 'static'}" role=${allowed ? 'button' : nothing}
      tabindex=${allowed ? '0' : nothing} aria-pressed=${active.length > 0} @click=${toggle}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && toggle()}>${content}</div>`
  }

  protected render() {
    const area = this.hass!.areas[this.config!.area]
    if (!area) return nothing
    const entities = this.roomEntities
    const summary = roomSummary(entities, area, this.hass!.states)
    const climate = this.thermostat
    const quick = quickGroups(entities)
    return html`<div class="wrap">
      <div class="top">
        <h1>${area.icon ? html`<ha-icon icon=${area.icon}></ha-icon>` : nothing}${area.name}</h1>
        <div class="values">
          ${climate ? nothing : this.valueChip(summary.temperature, 'mdi:thermometer')}
          ${this.valueChip(summary.humidity, 'mdi:water-percent')}
        </div>
      </div>
      ${climate || quick.length ? html`<div class="row">
        ${climate ? this.renderThermostat(climate) : nothing}
        ${quick.map(group => this.renderQuick(group.key, group.entities))}
      </div>` : nothing}
    </div>`
  }
}
