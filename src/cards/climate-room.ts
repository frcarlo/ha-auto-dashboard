// One room on the climate page: the thermostat in the middle (measured value large, target with −/+ beneath,
// both on the cold-to-warm scale), and below it every temperature and humidity reading the room has.
// A room without a thermostat shows its main temperature there instead.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { roomSummary } from '../model'
import { domainOf, entityIcon, entityName, hvacColor, isUnavailable, shortName } from '../presentation'
import { materials } from '../styles/materials'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface ClimateRoomConfig extends BaseConfig {
  area: string
  /** Thermostats and readings of the room, as the climate page picked them */
  entities: string[]
  /** Room page to open from the name */
  path?: string
}

const HVAC_ACTIONS = ['heating', 'cooling', 'drying', 'fan', 'idle', 'off']

/** Taps on −/+ are collected and sent as one set_temperature after this pause. */
const SEND_DELAY = 700

export class AdClimateRoom extends BaseCard<ClimateRoomConfig> {
  static properties = { ...BaseCard.properties, pending: { state: true } }
  /** Targets tapped in but not yet confirmed by HA, per thermostat */
  pending = new Map<string, number>()
  private timers = new Map<string, number>()

  static styles = [tokens, materials, css`
    :host { display: block; height: 100%; }
    .card { display: flex; flex-direction: column; padding: 14px 16px 10px; }
    /* Heating or cooling warms or cools the card from the top, like the light glow on light tiles */
    .card::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0; transition: opacity 0.6s ease; }
    .card.warning::before { opacity: 1; background: radial-gradient(ellipse 110% 70% at 50% 0%, rgba(var(--ad-warning), 0.2), transparent 70%); }
    .card.info::before { opacity: 1; background: radial-gradient(ellipse 110% 70% at 50% 0%, rgba(var(--ad-info), 0.2), transparent 70%); }

    .head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
    .room {
      all: unset; display: inline-flex; align-items: center; gap: 6px; min-width: 0; cursor: pointer;
      font-size: 15px; font-weight: 600;
    }
    .room ha-icon { --mdc-icon-size: 18px; opacity: 0.6; }
    .room .chev { --mdc-icon-size: 16px; opacity: 0.4; }
    .room span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .room:focus-visible, .now:focus-visible, .reading:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; border-radius: 6px; }
    .mode { margin-left: auto; font-size: 12px; opacity: 0.7; white-space: nowrap; }
    .mode.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .mode.info { color: rgb(var(--ad-info)); opacity: 1; }

    /* The thermostat: the room's one large number */
    .dial { display: flex; flex-direction: column; align-items: center; padding: 10px 0 6px; }
    .dial + .dial { border-top: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .dial .label { font-size: 12px; opacity: 0.6; margin-bottom: 2px; }
    .now {
      all: unset; cursor: pointer; font-size: 52px; font-weight: 200; letter-spacing: -0.05em; line-height: 1.05;
      font-variant-numeric: tabular-nums;
    }
    .now small { font-size: 22px; font-weight: 300; margin-left: 2px; opacity: 0.6; vertical-align: top; }
    .set { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
    .target { min-width: 64px; text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }
    .target b { font-size: 17px; font-weight: 600; }
    .target.pending { opacity: 0.55; }
    .track { position: relative; align-self: stretch; height: 14px; margin-top: 8px; }
    .track .scale { bottom: 5px; border-radius: 2px; }

    /* Every other reading of the room */
    .readings { display: flex; flex-direction: column; margin-top: 6px; border-top: 1px solid rgba(var(--ad-on-surface), 0.06); padding-top: 4px; }
    .reading {
      all: unset; display: flex; align-items: center; gap: 10px; padding: 7px 2px; cursor: pointer; font-size: 13px;
    }
    .reading ha-icon { --mdc-icon-size: 18px; opacity: 0.55; flex: 0 0 auto; }
    .reading .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.75; }
    .reading .v { font-variant-numeric: tabular-nums; font-weight: 500; white-space: nowrap; }
    .reading .v small { font-weight: 400; opacity: 0.6; margin-left: 2px; }
    .reading.off { opacity: 0.45; }
  `]

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 }
  }

  getCardSize() {
    return 4
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    for (const timer of this.timers.values()) window.clearTimeout(timer)
    this.timers.clear()
  }

  protected watched() {
    return this.config!.entities
  }

  private get entities() {
    return this.config!.entities.map(id => this.hass!.states[id]).filter((e): e is HassEntity => !!e)
  }

  protected willUpdate() {
    super.willUpdate()
    // HA caught up with a tapped target
    for (const [id, value] of this.pending) {
      if (!this.timers.has(id) && this.hass!.states[id]?.attributes.temperature === value) this.pending.delete(id)
    }
  }

  private nudge(climate: HassEntity, direction: number) {
    const a = climate.attributes
    const id = climate.entity_id
    const step = (a.target_temp_step as number | undefined) ?? 0.5
    const base = this.pending.get(id) ?? (a.temperature as number)
    const next = Math.min(a.max_temp ?? Infinity, Math.max(a.min_temp ?? -Infinity, Math.round((base + direction * step) / step) * step))
    this.pending = new Map(this.pending).set(id, next)
    window.clearTimeout(this.timers.get(id))
    this.timers.set(id, window.setTimeout(() => {
      this.timers.delete(id)
      Promise.resolve(this.call('climate', 'set_temperature', id, { temperature: next })).catch(() => {
        this.pending.delete(id)
        this.requestUpdate()
      })
    }, SEND_DELAY))
  }

  private action(climate: HassEntity) {
    const action = (climate.attributes.hvac_action as string | undefined) ?? climate.state
    const color = hvacColor(action === 'heating' ? 'heat' : action === 'cooling' ? 'cool' : action)
    const label = HVAC_ACTIONS.includes(action) ? t(this.hass, `hvac.${action}` as Key) : this.hass!.formatEntityState?.(climate) ?? action
    return { color, label }
  }

  private renderDial(climate: HassEntity, label?: string) {
    const a = climate.attributes
    const id = climate.entity_id
    const current = a.current_temperature as number | undefined
    const pending = this.pending.get(id)
    const target = pending ?? (a.temperature as number | undefined)
    const min = (a.min_temp as number | undefined) ?? 7
    const max = (a.max_temp as number | undefined) ?? 30
    const at = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`
    const adjustable = target !== undefined && !isUnavailable(climate) && this.canControl(id)
    const targetText = target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'
    return html`<div class="dial">
      ${label ? html`<span class="label">${label}</span>` : nothing}
      <button class="now" aria-label="${entityName(climate)}: ${this.number(current)}°" @click=${() => this.moreInfo(id)}>
        ${this.number(current)}<small>°</small></button>
      <div class="set">
        ${adjustable ? html`<button class="btn" aria-label="−" @click=${() => this.nudge(climate, -1)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
        <span class="target ${pending !== undefined ? 'pending' : ''}">${t(this.hass, 'target')} <b>${targetText}</b></span>
        ${adjustable ? html`<button class="btn" aria-label="+" @click=${() => this.nudge(climate, 1)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
      </div>
      ${current !== undefined ? html`<div class="track"><div class="scale" style="--now:${at(current)};--goal:${at(target ?? current)}">
        <span class="now"></span>${target !== undefined ? html`<span class="goal"></span>` : nothing}
      </div></div>` : nothing}
    </div>`
  }

  /** Without a thermostat the room's main temperature takes the middle, read only. */
  private renderMain(entity: HassEntity) {
    const { value, unit: own } = this.value(entity)
    // Same degree sign as on the thermostats
    const unit = /^°[CF]$/.test(own) ? '°' : own
    return html`<div class="dial">
      <button class="now" aria-label="${entityName(entity)}: ${value} ${unit}" @click=${() => this.moreInfo(entity.entity_id)}>
        ${value}<small>${unit}</small></button>
    </div>`
  }

  private renderReading(entity: HassEntity, areaName?: string) {
    const off = isUnavailable(entity)
    const domain = domainOf(entity.entity_id)
    const { value, unit } = domain === 'sensor' ? this.value(entity) : { value: this.hass!.formatEntityState?.(entity) ?? entity.state, unit: '' }
    const name = shortName(entityName(entity), areaName)
    return html`<button class="reading ${off ? 'off' : ''}" title=${entityName(entity)} @click=${() => this.moreInfo(entity.entity_id)}>
      <ha-icon icon=${entityIcon(entity)}></ha-icon>
      <span class="n">${name}</span>
      <span class="v">${off ? '–' : value}${!off && unit ? html`<small>${unit}</small>` : nothing}</span>
    </button>`
  }

  protected render() {
    const area = this.hass!.areas[this.config!.area]
    const entities = this.entities
    const thermostats = entities.filter(e => domainOf(e.entity_id) === 'climate')
    const summary = roomSummary(entities, area, this.hass!.states)
    // The middle: the thermostats, or the room's temperature sensor when there is none
    const main = thermostats.length ? undefined : summary.temperature?.entity
    const readings = entities.filter(e => domainOf(e.entity_id) !== 'climate' && e !== main)
    // The card glows while any thermostat heats or cools
    const active = thermostats.map(c => this.action(c)).find(a => a.color === 'warning' || a.color === 'info')
    const single = thermostats.length === 1 ? this.action(thermostats[0]!) : undefined
    const path = this.config!.path
    return html`<div class="card ${active?.color ?? ''}">
      <div class="head">
        <button class="room" ?disabled=${!path} @click=${() => path && this.navigate(path)}>
          ${area?.icon ? html`<ha-icon icon=${area.icon}></ha-icon>` : nothing}
          <span>${area?.name ?? this.config!.area}</span>
          ${path ? html`<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>` : nothing}
        </button>
        ${single ? html`<span class="mode ${single.color}">${single.label}</span>` : nothing}
      </div>
      ${thermostats.map(c => this.renderDial(c, thermostats.length > 1 ? shortName(entityName(c), area?.name) : undefined))}
      ${main ? this.renderMain(main) : nothing}
      ${readings.length ? html`<div class="readings">${readings.map(e => this.renderReading(e, area?.name))}</div>` : nothing}
    </div>`
  }
}
