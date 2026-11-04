// Top of a room page: name, temperature and humidity, a thermostat when the room has one,
// and quick tiles that switch all lights, all switches or all covers of the room.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { canBulk } from '../access'
import { areaEntities, entityIndex, hideOf, quickGroups, roomSummary, type QuickKey, type Reading } from '../model'
import { domainOf, hvacColor, isActive, isUnavailable } from '../presentation'
import { materials } from '../styles/materials'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface RoomHeaderConfig extends BaseConfig {
  area: string
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

const HVAC_ACTIONS = ['heating', 'cooling', 'drying', 'fan', 'idle', 'off']

/** Taps on −/+ are collected and sent as one set_temperature after this pause. */
const SEND_DELAY = 700

export class AdRoomHeader extends BaseCard<RoomHeaderConfig> {
  static properties = { ...BaseCard.properties, pending: { state: true } }
  /** Target temperature tapped in but not yet confirmed by HA */
  pending?: number
  private sendTimer?: number

  static styles = [tokens, materials, css`
    :host { display: block; container-type: inline-size; }
    .wrap { padding: 8px 4px 4px; display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 20px; }
    /* Area picture: the name sits on the photo, darkened at the bottom so it stays readable */
    .top.photo {
      min-height: 160px; box-sizing: border-box; padding: 18px; border-radius: var(--ad-radius); color: #fff; align-content: flex-end;
      background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.05) 70%), var(--photo) center / cover no-repeat;
    }
    /* The room name is the page's one big type element */
    h1 { min-width: 0; margin: 0; font-size: 44px; font-weight: 200; letter-spacing: -0.045em; line-height: 1; }
    .values { display: flex; gap: 16px; }
    .value {
      all: unset; display: inline-flex; align-items: baseline; gap: 4px; cursor: pointer; font-size: 16px; font-weight: 300;
      font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0.8;
    }
    .value ha-icon { --mdc-icon-size: 16px; opacity: 0.6; align-self: center; }
    .value:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 3px; border-radius: 4px; }
    .row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    .row::-webkit-scrollbar { display: none; }
    .tile {
      position: relative; overflow: hidden; isolation: isolate; flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
      min-width: 150px; min-height: 60px; padding: 10px 12px 10px 14px; box-sizing: border-box;
      border-radius: 18px; background: var(--ad-surface); box-shadow: var(--ad-shadow); cursor: pointer; user-select: none;
    }
    :host([glass]) .tile { background: var(--ad-glass-bg); }
    .tile.static { cursor: default; }
    .tile:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .tile > .text, .tile > .btn, .tile > .pilot, .tile > .now, .tile > .set { position: relative; z-index: 1; }
    .tile .text { flex: 1; display: flex; flex-direction: column; gap: 1px; }
    .tile .label { font-size: 14px; font-weight: 600; }
    .tile .sub { font-size: 12px; opacity: 0.65; white-space: nowrap; }
    .tile .btn { width: 30px; height: 30px; }
    .thermo { padding-bottom: 14px; }
    .thermo .now { font-size: 28px; font-weight: 200; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; cursor: pointer; }
    .thermo .set { display: flex; align-items: center; gap: 4px; }
    .thermo .target { min-width: 40px; text-align: center; font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .thermo .target.pending { opacity: 0.6; }
    .mode { font-size: 12px; opacity: 0.7; }
    .mode.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .mode.info { color: rgb(var(--ad-info)); opacity: 1; }
    @container (max-width: 480px) {
      h1 { font-size: 34px; }
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
    return areaEntities(this.hass!, this.config!.area, hideOf(this.config!))
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

  private valueChip(reading: Reading | undefined, icon: string, digits: number) {
    if (!reading) return nothing
    return html`<button class="value" @click=${() => this.moreInfo(reading.entity.entity_id)}>
      <ha-icon icon=${icon}></ha-icon>${this.number(reading.value, digits)}${reading.unit}</button>`
  }

  private renderThermostat(climate: HassEntity) {
    const a = climate.attributes
    const current = a.current_temperature as number | undefined
    const target = this.pending ?? (a.temperature as number | undefined)
    const action = (a.hvac_action as string | undefined) ?? climate.state
    const color = hvacColor(action === 'heating' ? 'heat' : action === 'cooling' ? 'cool' : action)
    const label = HVAC_ACTIONS.includes(action) ? t(this.hass, `hvac.${action}` as Key) : this.hass!.formatEntityState?.(climate) ?? action
    const min = (a.min_temp as number | undefined) ?? 7
    const max = (a.max_temp as number | undefined) ?? 30
    const at = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`
    // heat_cool with a range, or off: show values only
    const adjustable = target !== undefined && this.canControl(climate.entity_id)
    return html`<div class="tile thermo static">
      <span class="now" role="button" tabindex="0" @click=${() => this.moreInfo(climate.entity_id)}
        @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.moreInfo(climate.entity_id)}>${this.number(current)}°</span>
      <div class="text">
        <span class="mode ${color}">${label}</span>
        <div class="set">
          ${adjustable ? html`<button class="btn" aria-label="−" @click=${() => this.nudge(climate, -1)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
          <span class="target ${this.pending !== undefined ? 'pending' : ''}" title=${t(this.hass, 'target')}>
            ${target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'}</span>
          ${adjustable ? html`<button class="btn" aria-label="+" @click=${() => this.nudge(climate, 1)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
        </div>
      </div>
      ${current !== undefined ? html`<div class="scale" style="--now:${at(current)};--goal:${at(target ?? current)}">
        <span class="now"></span>${target !== undefined ? html`<span class="goal"></span>` : nothing}
      </div>` : nothing}
    </div>`
  }

  private renderQuick(key: QuickKey, all: HassEntity[]) {
    const entities = all.filter(e => !isUnavailable(e))
    const ids = entities.map(e => e.entity_id)
    const active = entities.filter(e => isActive(e))
    const allowed = canBulk(this.config!.access, ids) && ids.every(id => this.canControl(id))
    const label = t(this.hass, `quick.${key}`)
    const covers = key !== 'light' && key !== 'switch'
    const sub = covers
      ? t(this.hass, 'n_open', { n: active.length })
      : entities.length > 1 ? t(this.hass, 'n_of_on', { n: active.length, total: entities.length }) : (active.length ? t(this.hass, 'on') : t(this.hass, 'off'))
    const text = html`<div class="text"><span class="label">${label}</span><span class="sub">${sub}</span></div>`

    if (covers) {
      // The slats show how far the covers are closed on average
      const positions = entities.map(e => (e.attributes.current_position as number | undefined) ?? (isActive(e) ? 100 : 0))
      const closed = Math.round(100 - positions.reduce((a, b) => a + b, 0) / Math.max(positions.length, 1))
      return html`<div class="tile static">
        <div class="slats" style="--closed:${closed}%" data-closed=${closed}></div>
        ${text}
        ${allowed ? html`
          <button class="btn" aria-label=${t(this.hass, 'all_open')} @click=${() => this.call('cover', 'open_cover', ids)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="btn" aria-label=${t(this.hass, 'all_close')} @click=${() => this.call('cover', 'close_cover', ids)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>` : nothing}
      </div>`
    }
    // Lights fill the tile by the share that is on; sockets show a pilot light
    const share = entities.length ? Math.round((active.length / entities.length) * 100) : 0
    // Something on: switch those off. All off: switch everything on.
    const toggle = () => allowed && this.call('homeassistant', active.length ? 'turn_off' : 'turn_on', active.length ? active.map(e => e.entity_id) : ids)
    return html`<div class="tile ${allowed ? '' : 'static'}" role=${allowed ? 'button' : nothing}
      tabindex=${allowed ? '0' : nothing} aria-pressed=${active.length > 0} aria-label="${label}: ${sub}" @click=${toggle}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && toggle()}>
      ${key === 'light' && share ? html`<div class="light-fill" style="--level:${share}%" ?data-full=${share >= 100}></div>` : nothing}
      ${text}
      <span class="pilot ${active.length ? 'on' : ''}" style="--pilot: ${key === 'light' ? 'var(--ad-warning)' : 'var(--ad-primary)'}"></span>
    </div>`
  }

  protected render() {
    const area = this.hass!.areas[this.config!.area]
    if (!area) return nothing
    const entities = this.roomEntities
    const summary = roomSummary(entities, area, this.hass!.states)
    const climate = this.thermostat
    const quick = quickGroups(entities)
    return html`<div class="wrap">
      <div class="top ${area.picture ? 'photo' : ''}" style=${area.picture ? `--photo: url('${area.picture}')` : ''}>
        <h1>${area.name}</h1>
        <div class="values">
          ${climate ? nothing : this.valueChip(summary.temperature, 'mdi:thermometer', 1)}
          ${this.valueChip(summary.humidity, 'mdi:water-percent', 0)}
        </div>
      </div>
      ${climate || quick.length ? html`<div class="row">
        ${climate ? this.renderThermostat(climate) : nothing}
        ${quick.map(group => this.renderQuick(group.key, group.entities))}
      </div>` : nothing}
    </div>`
  }
}
