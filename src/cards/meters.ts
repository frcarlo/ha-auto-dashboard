// Gas and water on the energy page: today, this month, what gas cost today, the current flow, and the last day
// as one bar per hour.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { formatVolume, loadUsage, meterFlow, meterPrice, meterUnit, usageFresh, usageOf, type Meter } from '../meters'
import { tokens } from '../styles/tokens'

interface MetersConfig extends BaseConfig {
  meters: Meter[]
}

export const METER_ICONS = { gas: 'mdi:fire', water: 'mdi:water' } as const

export class AdMeters extends BaseCard<MetersConfig> {
  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
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
    .axis { display: flex; justify-content: space-between; font-size: var(--ad-fs-xs); opacity: var(--ad-o3); font-variant-numeric: tabular-nums; }
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

  protected updated() {
    if (usageFresh(this.ids)) return
    void loadUsage(this.hass!, this.ids).then(() => this.requestUpdate())
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
    const max = Math.max(...(usage?.hours.map(([, v]) => v) ?? [0]), 0)
    const hour = (ms: number) => new Date(ms).toLocaleTimeString(this.loc, { hour: 'numeric' })
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
        </div>
        ${usage.hours.length ? html`
          <div class="bars" role="img" aria-label=${t(hass, 'meter.last_day')}>${usage.hours.map(([at, v]) => html`
            <span class=${v > 0 ? 'used' : ''} style="height:${max > 0 ? Math.max(3, (v / max) * 100) : 3}%"
              title="${hour(at)}: ${formatVolume(v, meterUnit(hass, meter), meter.kind, this.loc).value} ${formatVolume(v, meterUnit(hass, meter), meter.kind, this.loc).unit}"></span>`)}
          </div>
          <div class="axis"><span>${hour(usage.hours[0]![0])}</span><span>${hour(usage.hours[usage.hours.length - 1]![0])}</span></div>` : nothing}
      ` : html`<span class="empty">${t(hass, 'meter.loading')}</span>`}
    </section>`
  }

  protected render() {
    return html`<div class="grid">${this.config!.meters.map(m => this.renderMeter(m))}</div>`
  }
}
