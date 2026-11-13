// House at a glance on Home: indoor climate (average of the rooms), outdoor climate (outdoor areas), current power,
// and gas and water used today.
// Each tile leads to the page with the details.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { averageClimate, entityIndex, hideOf, housePower, roomPower, sourceIds, type PowerSources } from '../model'
import { formatVolume, loadUsage, meterFlow, meterUnit, usageFresh, usageOf, type Meter } from '../meters'
import { tokens } from '../styles/tokens'
import { METER_ICONS } from './meters'
import type { AreaRegistryEntry } from '../types'

interface HouseInfoConfig extends BaseConfig {
  /** Indoor rooms */
  areas: string[]
  outdoor?: string[]
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
  power_sources?: PowerSources
  /** Gas and water from HA's energy settings */
  meters?: Meter[]
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
    :host { display: block; height: 100%; container-type: inline-size; }
    /* Beside the weather (a row says so) the tiles stack and share its height */
    .row {
      display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; box-sizing: border-box;
      flex-direction: var(--ad-beside, row); height: var(--ad-beside-height, auto);
    }
    .row::-webkit-scrollbar { display: none; }
    .tile {
      all: unset; flex: 1 0 auto; min-width: 120px; display: flex; align-items: center; gap: 10px; box-sizing: border-box;
      padding: 10px 14px 10px 10px; border-radius: 18px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
    }
    :host([glass]) .tile { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .tile[role=link] { cursor: pointer; }
    .tile:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .label { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .value { font-size: var(--ad-fs-l); font-weight: 300; letter-spacing: -0.03em; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .value small { font-size: var(--ad-fs-s); opacity: var(--ad-o2); margin-left: 2px; letter-spacing: 0; }
    .value .hum { font-size: var(--ad-fs-s); opacity: var(--ad-o2); margin-left: 8px; letter-spacing: 0; }
    /* On a large screen the column beside the weather is wide enough for two tiles side by side: four tiles take
       two rows instead of four, and the weather no longer stretches to their height */
    @container (min-width: 400px) {
      .row { flex-flow: row var(--ad-beside-wrap, nowrap); }
      .tile { flex-basis: var(--ad-beside-basis, auto); }
    }
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
    ]).concat(sourceIds(this.config!.power_sources), (this.config!.meters ?? []).flatMap(m => [...m.meters, ...(m.rates ?? [])]))
  }

  private get meterIds() {
    return (this.config!.meters ?? []).flatMap(m => m.meters)
  }

  protected updated() {
    if (!this.meterIds.length || usageFresh(this.meterIds)) return
    void loadUsage(this.hass!, this.meterIds).then(() => this.requestUpdate())
  }

  /** Used today, and the flow while something runs */
  private meter(meter: Meter) {
    const usage = usageOf(meter.meters)
    if (!usage) return nothing
    const lang = this.hass!.locale?.language ?? this.hass!.language
    const v = formatVolume(usage.today, meterUnit(this.hass!, meter), meter.kind, lang)
    const flow = meterFlow(this.hass!, meter)
    return this.tile(METER_ICONS[meter.kind], t(this.hass, `meter.${meter.kind}_today`), html`${v.value}<small>${v.unit}</small>${flow && flow.value > 0
      ? html`<span class="hum">${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(flow.value)} ${flow.unit}</span>` : nothing}`, this.config!.links?.energy)
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
      ${(c.meters ?? []).map(m => this.meter(m))}
    </div>`
  }
}
