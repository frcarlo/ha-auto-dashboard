// House at a glance on Home: indoor climate (average of the rooms), outdoor climate (outdoor areas), current power.
// Each tile leads to the page with the details.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { averageClimate, entityIndex, hideOf, housePower, roomPower, sourceIds, type PowerSources } from '../model'
import { tokens } from '../styles/tokens'
import type { AreaRegistryEntry } from '../types'

interface HouseInfoConfig extends BaseConfig {
  /** Indoor rooms */
  areas: string[]
  outdoor?: string[]
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
  power_sources?: PowerSources
  /** View paths the tiles open */
  links?: { climate?: string; energy?: string }
}

export function formatWatts(watts: number, lang: string) {
  const kw = Math.abs(watts) >= 1000
  const value = new Intl.NumberFormat(lang, { maximumFractionDigits: kw ? 2 : 0 }).format(kw ? watts / 1000 : watts)
  return { value, unit: kw ? 'kW' : 'W' }
}

export class AdHouseInfo extends BaseCard<HouseInfoConfig> {
  static styles = [tokens, css`
    :host { display: block; }
    .row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    .row::-webkit-scrollbar { display: none; }
    .tile {
      all: unset; flex: 1 0 auto; min-width: 120px; display: flex; align-items: center; gap: 10px; box-sizing: border-box;
      padding: 10px 14px 10px 10px; border-radius: 18px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
    }
    :host([glass]) .tile { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .tile[role=link] { cursor: pointer; }
    .tile:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .label { font-size: 12px; opacity: 0.6; }
    .value { font-size: 20px; font-weight: 300; letter-spacing: -0.03em; white-space: nowrap; }
    .value small { font-size: 13px; opacity: 0.6; margin-left: 2px; letter-spacing: 0; }
    .value .hum { font-size: 13px; opacity: 0.7; margin-left: 8px; letter-spacing: 0; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  private areas(ids: string[] = []): AreaRegistryEntry[] {
    return ids.map(id => this.hass!.areas[id]).filter((a): a is AreaRegistryEntry => !!a)
  }

  private get hide() {
    return hideOf(this.config!)
  }

  protected watched() {
    const index = entityIndex(this.hass!, this.config!.hide_labels).byArea
    return this.areas([...this.config!.areas, ...(this.config!.outdoor ?? [])]).flatMap(area => [
      ...(index.get(area.area_id) ?? []),
      ...[area.temperature_entity_id, area.humidity_entity_id].filter((id): id is string => !!id),
    ]).concat(sourceIds(this.config!.power_sources))
  }

  private tile(icon: string, label: string, value: unknown, link?: string) {
    return html`<div class="tile" role=${link ? 'link' : nothing} tabindex=${link ? '0' : nothing}
      @click=${() => link && this.navigate(link)} @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && link && this.navigate(link)}>
      <span class="dot"><ha-icon icon=${icon}></ha-icon></span>
      <span class="text"><span class="label">${label}</span><span class="value">${value}</span></span>
    </div>`
  }

  private climate(icon: string, label: string, ids: string[] | undefined, link?: string) {
    const avg = averageClimate(this.hass!, this.areas(ids), this.hide)
    if (avg.temperature === undefined) return nothing
    return this.tile(icon, label, html`${this.number(avg.temperature)}<small>${avg.unit}</small>${avg.humidity !== undefined
      ? html`<span class="hum">${this.number(avg.humidity, 0)} %</span>` : nothing}`, link)
  }

  protected render() {
    const c = this.config!
    const rooms = roomPower(this.hass!, this.areas(c.areas), this.hide)
    // HA's energy settings know the whole house; the rooms' sum misses what has no own sensor
    const house = housePower(this.hass!, c.power_sources)
    const watts = house?.total ?? rooms.reduce((sum, room) => sum + room.total, 0)
    const power = formatWatts(watts, this.hass!.locale?.language ?? this.hass!.language)
    return html`<div class="row">
      ${this.climate('mdi:home-thermometer-outline', t(this.hass, 'inside'), c.areas, c.links?.climate)}
      ${c.outdoor?.length ? this.climate('mdi:tree-outline', t(this.hass, 'outside'), c.outdoor) : nothing}
      ${rooms.length || house ? this.tile('mdi:flash', t(this.hass, 'power'), html`${power.value}<small>${power.unit}</small>`, c.links?.energy) : nothing}
    </div>`
  }
}
