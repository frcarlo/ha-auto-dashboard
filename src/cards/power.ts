// Energy page: the whole house (total, the room that uses the most and its biggest consumers),
// or one room with each power sensor and its share of the room.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { formatWatts } from './house-info'
import { t } from '../i18n'
import { entityIndex, hideOf, housePower, roomPower, sourceIds, type PowerSources, type RoomPower } from '../model'
import { entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import type { AreaRegistryEntry } from '../types'

interface PowerConfig extends BaseConfig {
  variant: 'house' | 'room'
  /** All rooms for the house, the one room for a room card */
  areas: string[]
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
  /** Room without a graph next to it: take the whole row */
  wide?: boolean
  /** Sensors from HA's energy settings; the house total comes from them when set */
  power_sources?: PowerSources
}

const FLOW_ICONS = { grid: 'mdi:transmission-tower', solar: 'mdi:solar-power-variant', battery: 'mdi:home-battery-outline' }

export class AdPower extends BaseCard<PowerConfig> {
  static styles = [tokens, css`
    :host { display: block; height: 100%; }
    .card { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; align-items: baseline; gap: 8px; }
    .title { flex: 1; min-width: 0; font-size: 13px; opacity: 0.65; display: flex; align-items: center; gap: 6px; }
    .title ha-icon { --mdc-icon-size: 18px; }
    .total { font-size: 28px; font-weight: 300; letter-spacing: -0.03em; white-space: nowrap; }
    .total small, .w small { font-size: 13px; opacity: 0.6; margin-left: 2px; letter-spacing: 0; }
    .top { font-size: 12px; opacity: 0.6; }
    .flows { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; }
    .flows span { display: inline-flex; align-items: center; gap: 4px; }
    .flows ha-icon { --mdc-icon-size: 16px; opacity: 0.6; }
    .flows small { font-size: 11px; opacity: 0.6; margin-left: 1px; }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .rowx { all: unset; display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; cursor: pointer; font-size: 13px; }
    .rowx:focus-visible { outline: 2px solid rgb(var(--ad-primary)); border-radius: 6px; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .w { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .bar { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: rgba(var(--ad-on-surface), 0.08); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 2px; background: rgb(var(--ad-warning)); }
  `]

  getGridOptions() {
    // A room card sits next to its graph; the house card has its section to itself
    return { columns: this.config?.variant === 'room' && !this.config.wide ? 12 : 'full', rows: 'auto' }
  }

  getCardSize() {
    return 3
  }

  private get rooms(): RoomPower[] {
    const areas = this.config!.areas.map(id => this.hass!.areas[id]).filter((a): a is AreaRegistryEntry => !!a)
    return roomPower(this.hass!, areas, hideOf(this.config!))
  }

  protected watched() {
    const index = entityIndex(this.hass!, this.config!.hide_labels).byArea
    return [...this.config!.areas.flatMap(id => index.get(id) ?? []), ...sourceIds(this.config!.power_sources)]
  }

  private watts(w: number) {
    const f = formatWatts(w, this.hass!.locale?.language ?? this.hass!.language)
    return html`${f.value}<small>${f.unit}</small>`
  }

  private rows(room: RoomPower, limit?: number) {
    const max = room.sensors[0]?.watts || 1
    return html`<div class="rows">
      ${room.sensors.slice(0, limit).map(({ entity, watts }) => html`
        <button class="rowx" @click=${() => this.moreInfo(entity.entity_id)}>
          <span class="name">${shortName(entityName(entity), room.area.name)}</span>
          <span class="w">${this.watts(watts)}</span>
          <span class="bar"><span style="width:${Math.max(0, Math.min(100, (watts / max) * 100))}%"></span></span>
        </button>`)}
    </div>`
  }

  protected render() {
    const rooms = this.rooms
    if (this.config!.variant === 'room') {
      const room = rooms[0]
      if (!room) return nothing
      return html`<div class="card">
        <div class="head">
          <span class="title">${room.area.icon ? html`<ha-icon icon=${room.area.icon}></ha-icon>` : nothing}${room.area.name}</span>
          <span class="total">${this.watts(room.total)}</span>
        </div>
        ${this.rows(room)}
      </div>`
    }
    const house = housePower(this.hass!, this.config!.power_sources)
    const total = house?.total ?? rooms.reduce((sum, room) => sum + room.total, 0)
    const top = rooms[0]
    const flows = house ? (['grid', 'solar', 'battery'] as const).filter(k => house[k] !== undefined) : []
    return html`<div class="card">
      <div class="head">
        <span class="title"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon>${t(this.hass, 'whole_house')}</span>
        <span class="total">${this.watts(total)}</span>
      </div>
      ${flows.length ? html`<div class="flows">${flows.map(k => html`<span><ha-icon icon=${FLOW_ICONS[k]}></ha-icon>${t(this.hass, `flow.${k}`)} ${this.watts(house![k]!)}</span>`)}</div>` : nothing}
      ${top ? html`<span class="top">${t(this.hass, 'top_room')}: ${top.area.name} · ${this.watts(top.total)}</span>
        ${this.rows(top, 3)}` : nothing}
    </div>`
  }
}
