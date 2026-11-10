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

/** °C and °F show as a bare degree sign, like on the thermostats. */
const degree = (unit: string) => (/^°[CF]$/.test(unit) ? '°' : unit)

export class AdClimateRoom extends BaseCard<ClimateRoomConfig> {
  static properties = { ...BaseCard.properties, pending: { state: true } }
  /** Targets tapped in but not yet confirmed by HA, per thermostat */
  pending = new Map<string, number>()
  private timers = new Map<string, number>()

  static styles = [tokens, materials, css`
    :host { display: block; height: 100%; }
    .card { display: flex; flex-direction: column; padding: 16px 16px 12px; }

    .head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
    .room {
      all: unset; display: inline-flex; align-items: center; gap: 8px; min-width: 0; cursor: pointer;
      font-size: var(--ad-fs-m); font-weight: 500;
    }
    .room ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); }
    .room .chev { --mdc-icon-size: 16px; opacity: 0.4; }
    .room span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .room:focus-visible, .now:focus-visible, .reading:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; border-radius: 6px; }
    .mode { margin-left: auto; font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; }
    .mode.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .mode.info { color: rgb(var(--ad-info)); opacity: 1; }

    /* The thermostat: the room's one large number. It takes the free height, so a short card next to a tall one stays balanced. */
    .dial { flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0 4px; }
    .dial + .dial { border-top: 1px solid rgba(var(--ad-on-surface), 0.06); }
    .dial .label { font-size: var(--ad-fs-s); opacity: var(--ad-o2); margin-bottom: 4px; }
    .now {
      all: unset; cursor: pointer; font-size: var(--ad-fs-2xl); font-weight: 300; letter-spacing: -0.03em; line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .now small { font-size: var(--ad-fs-l); margin-left: 2px; opacity: var(--ad-o2); vertical-align: top; }
    .set { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
    .target { min-width: 64px; text-align: center; font-size: var(--ad-fs-m); font-variant-numeric: tabular-nums; }
    .target span { opacity: var(--ad-o2); }
    .target b { font-weight: 500; }
    .target.pending b { opacity: 0.55; }
    .track { position: relative; align-self: stretch; height: 20px; margin-top: 8px; }
    .track .scale { bottom: 4px; border-radius: 2px; }
    /* While heating or cooling, the dot and the stretch to the target light up: the only color on the card */
    .scale .run { position: absolute; top: 0; bottom: 0; border-radius: 2px; }
    .scale .run.warning, .scale.warning .now { background: rgb(var(--ad-warning)); }
    .scale .run.info, .scale.info .now { background: rgb(var(--ad-info)); }

    /* Every other reading of the room */
    .readings { display: flex; flex-direction: column; margin-top: 8px; border-top: 1px solid rgba(var(--ad-on-surface), 0.06); padding-top: 4px; }
    .reading {
      all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; font-size: var(--ad-fs-m);
    }
    .reading ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); flex: 0 0 auto; }
    .reading .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: var(--ad-o2); }
    .reading .v { font-variant-numeric: tabular-nums; font-weight: 500; white-space: nowrap; }
    .reading .v small { font-weight: 400; opacity: var(--ad-o2); margin-left: 2px; }
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
    const { color } = this.action(climate)
    const adjustable = target !== undefined && !isUnavailable(climate) && this.canControl(id)
    const targetText = target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'
    return html`<div class="dial">
      ${label ? html`<span class="label">${label}</span>` : nothing}
      <button class="now" aria-label="${entityName(climate)}: ${this.number(current)}°" @click=${() => this.moreInfo(id)}>
        ${this.number(current)}<small>°</small></button>
      <div class="set">
        ${adjustable ? html`<button class="btn" aria-label="−" @click=${() => this.nudge(climate, -1)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
        <span class="target ${pending !== undefined ? 'pending' : ''}"><span>${t(this.hass, 'target')}</span> <b>${targetText}</b></span>
        ${adjustable ? html`<button class="btn" aria-label="+" @click=${() => this.nudge(climate, 1)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
      </div>
      ${current !== undefined ? this.renderScale(current, min, max, target, color === 'warning' || color === 'info' ? color : undefined) : nothing}
    </div>`
  }

  /** The cold-to-warm scale: a dot for the measured value, a tick for the target, and while heating or cooling the stretch between them in that color. */
  private renderScale(current: number, min: number, max: number, target?: number, run?: string) {
    const at = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))
    const now = at(current)
    const goal = at(target ?? current)
    return html`<div class="track"><div class="scale ${run ?? ''}" style="--now:${now}%;--goal:${goal}%">
      ${run ? html`<span class="run ${run}" style="left:${Math.min(now, goal)}%;width:${Math.abs(goal - now)}%"></span>` : nothing}
      <span class="now"></span>${target !== undefined ? html`<span class="goal"></span>` : nothing}
    </div></div>`
  }

  /** Without a thermostat the room's main temperature takes the middle, read only, on the same scale. */
  private renderMain(entity: HassEntity) {
    const { value, unit: own } = this.value(entity)
    const current = Number(entity.state)
    const [min, max] = own === '°F' ? [45, 86] : [7, 30]
    return html`<div class="dial">
      <button class="now" aria-label="${entityName(entity)}: ${value} ${own}" @click=${() => this.moreInfo(entity.entity_id)}>
        ${value}<small>${degree(own)}</small></button>
      ${/^°[CF]$/.test(own) && Number.isFinite(current) ? this.renderScale(current, min, max) : nothing}
    </div>`
  }

  private renderReading(entity: HassEntity, areaName?: string) {
    const off = isUnavailable(entity)
    const domain = domainOf(entity.entity_id)
    const reading = domain === 'sensor' ? this.value(entity) : { value: this.hass!.formatEntityState?.(entity) ?? entity.state, unit: '' }
    const { value } = reading
    const unit = degree(reading.unit)
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
    const single = thermostats.length === 1 ? this.action(thermostats[0]!) : undefined
    const path = this.config!.path
    return html`<div class="card">
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
