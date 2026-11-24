// Gas and water on the energy page: today, this month, what gas cost today, the current flow, and bars for the last
// day by the hour, or the last 7 or 30 days by the day.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { RANGE_DAYS, daysFresh, daysOf, formatVolume, loadDays, loadUsage, meterFlow, meterPrice, meterUnit, usageFresh, usageOf, type Meter } from '../meters'
import { onRange, rangeStyles, rangeSwitch, savedRange, setRange, type Range } from '../range'
import { tokens } from '../styles/tokens'

interface MetersConfig extends BaseConfig {
  meters: Meter[]
}

export const METER_ICONS = { gas: 'mdi:fire', water: 'mdi:water' } as const

export class AdMeters extends BaseCard<MetersConfig> {
  static properties = { ...BaseCard.properties, range: { state: true } }
  range: Range = savedRange('meters')
  private stopRange?: () => void

  static styles = [tokens, rangeStyles, css`
    :host { display: block; container-type: inline-size; }
    .top { display: flex; justify-content: flex-end; margin: -4px 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .meter { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; height: auto; }
    .head { display: flex; align-items: center; gap: 10px; }
    .head .dot { width: 32px; height: 32px; }
    .head .dot.gas { background: rgba(var(--ad-warning), 0.18); color: rgb(var(--ad-warning)); }
    .head .dot.water { background: rgba(var(--ad-info), 0.18); color: rgb(var(--ad-info)); }
    .head h3 { margin: 0; font-size: var(--ad-fs-m); font-weight: 600; }
    .head .flow { all: unset; cursor: pointer; margin-left: auto; font-size: var(--ad-fs-s); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .head .flow.on { opacity: 1; color: rgb(var(--ad-primary)); }
    .figures { display: flex; flex-wrap: wrap; gap: 8px 28px; }
    .fig { all: unset; display: flex; flex-direction: column; gap: 2px; }
    button.fig { cursor: pointer; }
    .flow:focus-visible, button.fig:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; border-radius: 6px; }
    .fig .k { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .fig .v { font-size: var(--ad-fs-l); font-weight: 300; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .fig .v small { font-size: var(--ad-fs-s); opacity: var(--ad-o2); margin-left: 2px; letter-spacing: 0; }
    .bars { display: flex; align-items: flex-end; gap: 2px; height: 64px; }
    .bars span { flex: 1; min-height: 2px; border-radius: 2px 2px 0 0; background: rgba(var(--ad-on-surface), 0.12); }
    .gas .bars span.used { background: rgba(var(--ad-warning), 0.75); }
    .water .bars span.used { background: rgba(var(--ad-info), 0.75); }
    .axis { display: flex; justify-content: space-between; gap: 2px; font-size: var(--ad-fs-xs); opacity: var(--ad-o3); font-variant-numeric: tabular-nums; }
    .axis span { white-space: nowrap; }
    .axis:has(span:nth-child(3)) span { flex: 1; text-align: center; }
    .empty { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 4
  }

  private get ids() {
    return this.config!.meters.flatMap(m => m.meters)
  }

  protected watched() {
    return this.config!.meters.flatMap(m => [...m.meters, ...(m.rates ?? []), ...(m.price_entity ? [m.price_entity] : [])])
  }

  connectedCallback() {
    super.connectedCallback()
    this.stopRange = onRange('meters', range => (this.range = range))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopRange?.()
  }

  protected updated() {
    if (!usageFresh(this.ids)) void loadUsage(this.hass!, this.ids).then(() => this.requestUpdate())
    const range = this.range
    if (range !== 'day' && !daysFresh(this.ids, range)) void loadDays(this.hass!, this.ids, range).then(() => this.requestUpdate())
  }

  /** The bars of the chosen range: hours of the last day, or days; undefined while loading */
  private bars(meter: Meter): [number, number][] | undefined {
    return this.range === 'day' ? usageOf(meter.meters)?.hours : daysOf(meter.meters, this.range)
  }

  /** Under the bars and in their tooltips: the hour, the weekday, or the date */
  private when(ms: number, full = false) {
    const d = new Date(ms)
    if (this.range === 'day') return d.toLocaleTimeString(this.loc, { hour: 'numeric' })
    if (this.range === 'week' && !full) return d.toLocaleDateString(this.loc, { weekday: 'short' })
    return d.toLocaleDateString(this.loc, full ? { weekday: 'short', day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'numeric' })
  }

  private get loc() {
    return this.hass!.locale?.language ?? this.hass!.language
  }

  private volume(meter: Meter, value: number) {
    const v = formatVolume(value, meterUnit(this.hass!, meter), meter.kind, this.loc)
    return html`${v.value}<small>${v.unit}</small>`
  }

  private renderMeter(meter: Meter) {
    const hass = this.hass!
    const usage = usageOf(meter.meters)
    const flow = meterFlow(hass, meter)
    const price = meterPrice(hass, meter)
    const bars = this.bars(meter)
    const max = Math.max(...(bars?.map(([, v]) => v) ?? [0]), 0)
    const vol = (v: number) => { const f = formatVolume(v, meterUnit(hass, meter), meter.kind, this.loc); return `${f.value} ${f.unit}` }
    const range = this.range
    const money = (n: number) => new Intl.NumberFormat(this.loc, { style: 'currency', currency: hass.config?.currency ?? 'EUR' }).format(n)
    return html`<section class="card meter ${meter.kind}">
      <div class="head">
        <span class="dot ${meter.kind}"><ha-icon icon=${METER_ICONS[meter.kind]}></ha-icon></span>
        <h3>${t(hass, `meter.${meter.kind}`)}</h3>
        ${flow ? html`<button class="flow ${flow.value > 0 ? 'on' : ''}"
          @click=${() => this.moreInfo(meter.rates![0]!)}>${flow.value > 0
            ? `${new Intl.NumberFormat(this.loc, { maximumFractionDigits: 2 }).format(flow.value)} ${flow.unit}`
            : t(hass, 'meter.idle')}</button>` : nothing}
      </div>
      ${usage ? html`
        <div class="figures">
          <button class="fig" @click=${() => this.moreInfo(meter.meters[0]!)}>
            <span class="k">${t(hass, 'meter.today')}</span><span class="v">${this.volume(meter, usage.today)}</span>
          </button>
          <div class="fig"><span class="k">${t(hass, 'meter.month')}</span><span class="v">${this.volume(meter, usage.month)}</span></div>
          ${price !== undefined ? html`<div class="fig"><span class="k">${t(hass, 'meter.cost_today')}</span><span class="v">${money(usage.today * price)}</span></div>` : nothing}
          ${range !== 'day' && bars ? html`<div class="fig"><span class="k">${t(hass, 'meter.last_days', { n: RANGE_DAYS[range] })}</span>
            <span class="v">${this.volume(meter, bars.reduce((sum, [, v]) => sum + v, 0))}</span></div>` : nothing}
        </div>
        ${bars?.length ? html`
          <div class="bars" role="img" aria-label=${range === 'day' ? t(hass, 'meter.last_day') : t(hass, 'meter.per_day', { n: RANGE_DAYS[range] })}>${bars.map(([at, v]) => html`
            <span class=${v > 0 ? 'used' : ''} style="height:${max > 0 ? Math.max(3, (v / max) * 100) : 3}%" title="${this.when(at, true)}: ${vol(v)}"></span>`)}
          </div>
          <div class="axis">${range === 'week'
            ? bars.map(([at]) => html`<span>${this.when(at)}</span>`)
            : html`<span>${this.when(bars[0]![0])}</span><span>${this.when(bars[bars.length - 1]![0])}</span>`}</div>` : nothing}
      ` : html`<span class="empty">${t(hass, 'meter.loading')}</span>`}
    </section>`
  }

  protected render() {
    return html`<div class="top">${rangeSwitch(this.hass, this.range, range => setRange('meters', range))}</div>
      <div class="grid">${this.config!.meters.map(m => this.renderMeter(m))}</div>`
  }
}
