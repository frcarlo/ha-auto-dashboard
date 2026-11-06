// Weather on Home: now (measured outside when outdoor areas have sensors), the details, warnings, and the next days.
// HA keeps forecasts out of the state, so the card subscribes to them like HA's own weather card.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { averageClimate, entityIndex, hideOf } from '../model'
import { tokens } from '../styles/tokens'
import type { AreaRegistryEntry } from '../types'
import {
  activeWarnings, compass, conditionIcon, conditionTone, forecastDays, forecastType, temperatureColor, todayDate,
  type ForecastEntry, type Warning,
} from '../weather'

interface WeatherConfig extends BaseConfig {
  entity: string
  /** Warning entities (NINA, DWD); without them there is no warning line */
  warnings?: string[]
  /** Outdoor areas: their sensors give the temperature and humidity now */
  outdoor?: string[]
  /** Days of forecast, 3 by default, 0 for none */
  days?: number
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

export class AdWeather extends BaseCard<WeatherConfig> {
  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    .card { padding: 16px; cursor: pointer; }
    .card:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .layout { display: grid; gap: 16px; }
    .now { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

    .top { display: flex; align-items: center; gap: 12px; }
    .cond { --mdc-icon-size: 48px; flex: 0 0 auto; color: rgba(var(--ad-on-surface), 0.7); }
    .cond.sun, .cond.storm { color: rgb(var(--ad-warning)); }
    .cond.wet { color: rgb(var(--ad-info)); }
    .temp { font-size: 48px; font-weight: 200; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
    .temp small { font-size: 20px; font-weight: 300; opacity: 0.5; margin-left: 2px; vertical-align: top; letter-spacing: 0; }
    .desc { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; margin-left: 4px; }
    /* Long conditions ("Teilweise bewölkt") wrap rather than lose their end */
    .state { font-size: 16px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .sub { font-size: 13px; opacity: 0.6; font-variant-numeric: tabular-nums; }

    .details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
    .detail { display: flex; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap; min-width: 0; }
    .detail ha-icon { --mdc-icon-size: 16px; opacity: 0.5; }
    .detail span { overflow: hidden; text-overflow: ellipsis; }

    .warns { display: flex; flex-direction: column; gap: 8px; }
    .warn {
      all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 12px; cursor: pointer;
      background: rgba(var(--tone), 0.12); --tone: var(--ad-warning);
    }
    .warn.ok { --tone: var(--ad-success); }
    .warn.error { --tone: var(--ad-error); }
    .warn ha-icon { --mdc-icon-size: 20px; color: rgb(var(--tone)); flex: 0 0 auto; }
    .warn span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .warn b { font-weight: 500; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .warn small { font-size: 12px; opacity: 0.6; }
    .warn:focus-visible { outline: 2px solid rgb(var(--tone)); }

    .days { display: flex; flex-direction: column; gap: 8px; padding-top: 16px; border-top: 1px solid rgba(var(--ad-on-surface), 0.08); }
    .day {
      display: grid; grid-template-columns: 4em 20px 2.5em minmax(0, 1fr) 2.5em; align-items: center; gap: 8px;
      font-size: 14px; font-variant-numeric: tabular-nums;
    }
    .weekday { opacity: 0.7; }
    .day.today .weekday { opacity: 1; font-weight: 500; }
    .day ha-icon { --mdc-icon-size: 20px; color: rgba(var(--ad-on-surface), 0.6); }
    .day ha-icon.sun, .day ha-icon.storm { color: rgb(var(--ad-warning)); }
    .day ha-icon.wet { color: rgb(var(--ad-info)); }
    .days.wet .day { grid-template-columns: 4em 20px 2.5em 2.5em minmax(0, 1fr) 2.5em; }
    .rain { font-size: 12px; color: rgb(var(--ad-info)); }
    .low { text-align: right; opacity: 0.6; }
    .high { text-align: right; }
    .track { position: relative; height: 6px; border-radius: 3px; background: rgba(var(--ad-on-surface), 0.08); }
    .fill { position: absolute; top: 0; bottom: 0; border-radius: 3px; min-width: 6px; }
    .mark {
      position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%;
      background: rgb(var(--ad-on-surface)); box-shadow: 0 0 0 2px var(--ad-surface);
    }

    @container (max-width: 400px) {
      .cond { --mdc-icon-size: 40px; }
      .temp { font-size: 40px; }
    }
    /* Wide: now on the left, the days on the right */
    @container (min-width: 600px) {
      .layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: center; }
      .days { border-top: 0; padding-top: 0; }
    }
  `]

  private forecast?: ForecastEntry[]
  private unsubscribe?: Promise<(() => void) | undefined>
  private subscribed?: string

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 4
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.hasUpdated) this.subscribe()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubscribe?.then(off => off?.())
    this.unsubscribe = undefined
    this.subscribed = undefined
  }

  protected updated() {
    this.subscribe()
  }

  /** Subscribe once per entity and forecast kind; HA pushes a new forecast whenever it changes. */
  private subscribe() {
    const c = this.config
    const entity = this.state(c?.entity)
    if (!c || !this.hass || !entity || (c.days ?? 3) <= 0) return
    const type = forecastType(entity)
    const key = `${entity.entity_id}|${type}`
    if (key === this.subscribed) return
    this.unsubscribe?.then(off => off?.())
    this.unsubscribe = undefined
    this.subscribed = key
    this.forecast = undefined
    if (!type || !this.hass.connection) return
    this.unsubscribe = this.hass.connection.subscribeMessage<{ forecast?: ForecastEntry[] | null }>(msg => {
      this.forecast = msg.forecast ?? undefined
      this.requestUpdate()
    }, { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entity.entity_id }).catch(() => undefined)
  }

  private get outdoorAreas(): AreaRegistryEntry[] {
    return (this.config!.outdoor ?? []).map(id => this.hass!.areas[id]).filter((a): a is AreaRegistryEntry => !!a)
  }

  protected watched() {
    const index = entityIndex(this.hass!, this.config!.hide_labels).byArea
    return [
      this.config!.entity,
      ...(this.config!.warnings ?? []),
      ...this.outdoorAreas.flatMap(area => [
        ...(index.get(area.area_id) ?? []),
        ...[area.temperature_entity_id, area.humidity_entity_id].filter((id): id is string => !!id),
      ]),
    ]
  }

  private get language() {
    return this.hass!.locale?.language ?? this.hass!.language
  }

  /** Whole numbers stay whole, measured ones keep their tenth. */
  private temp(n: number | undefined) {
    if (n === undefined || !Number.isFinite(Number(n))) return '–'
    return this.number(n, Number.isInteger(Number(n)) ? 0 : 1)
  }

  private time(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const sameDay = d.toDateString() === new Date().toDateString()
    return d.toLocaleString(this.language, sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }

  private renderWarnings() {
    const ids = this.config!.warnings ?? []
    if (!ids.length) return nothing
    const active = activeWarnings(this.hass!, ids)
    const open = (e: Event, id: string) => { e.stopPropagation(); this.moreInfo(id) }
    if (!active.length) {
      return html`<div class="warns"><button class="warn ok" @click=${(e: Event) => open(e, ids[0]!)}>
        <ha-icon icon="mdi:shield-check-outline"></ha-icon><span><b>${t(this.hass, 'no_warnings')}</b></span>
      </button></div>`
    }
    return html`<div class="warns">${active.map((w: Warning) => html`
      <button class="warn ${w.severity}" @click=${(e: Event) => open(e, w.entity_id)}>
        <ha-icon icon=${w.severity === 'error' ? 'mdi:alert-octagon-outline' : 'mdi:alert-outline'}></ha-icon>
        <span><b>${w.headline}</b>${w.until ? html`<small>${t(this.hass, 'until', { time: this.time(w.until) })}</small>` : nothing}</span>
      </button>`)}</div>`
  }

  protected render() {
    const c = this.config!
    const weather = this.state(c.entity)
    if (!weather) return nothing
    const a = weather.attributes
    const unit = String(a.temperature_unit ?? '°C')
    // Sensors at the house know the temperature outside better than a forecast service
    const measured = averageClimate(this.hass!, this.outdoorAreas, hideOf(c))
    const now = measured.temperature ?? a.temperature
    const humidity = measured.humidity ?? a.humidity
    const days = forecastDays(this.forecast ?? a.forecast).slice(0, c.days ?? 3)
    const today = days[0]?.date === todayDate() ? days[0] : undefined
    const dir = compass(a.wind_bearing, t(this.hass, 'compass').split(','))

    const details = [
      humidity !== undefined ? ['mdi:water-percent', `${this.number(humidity, 0)} %`] : undefined,
      a.wind_speed !== undefined ? ['mdi:weather-windy', `${this.temp(a.wind_speed)} ${a.wind_speed_unit ?? ''}${dir ? ` ${dir}` : ''}`] : undefined,
      a.pressure !== undefined ? ['mdi:gauge', `${this.number(a.pressure, 0)} ${a.pressure_unit ?? ''}`] : undefined,
      a.visibility !== undefined ? ['mdi:eye-outline', `${this.temp(a.visibility)} ${a.visibility_unit ?? ''}`] : undefined,
      a.uv_index !== undefined ? ['mdi:white-balance-sunny', `UV ${this.number(a.uv_index, 0)}`] : undefined,
    ].filter((d): d is [string, string] => !!d).slice(0, 4)

    const sub = [
      today?.high !== undefined && today.low !== undefined ? `↑ ${this.temp(today.high)}°  ↓ ${this.temp(today.low)}°` : undefined,
      a.apparent_temperature !== undefined && Math.round(a.apparent_temperature) !== Math.round(now) ? t(this.hass, 'feels_like', { t: `${this.temp(a.apparent_temperature)}°` }) : undefined,
    ].filter(Boolean).join(' · ')

    return html`<div class="card" role="button" tabindex="0" aria-label=${t(this.hass, 'weather')}
      @click=${() => this.moreInfo(weather.entity_id)} @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.moreInfo(weather.entity_id)}>
      <div class="layout">
        <div class="now">
          <div class="top">
            <ha-icon class="cond ${conditionTone(weather.state)}" icon=${conditionIcon(weather.state)}></ha-icon>
            <span class="temp">${this.temp(now)}<small>${unit}</small></span>
            <span class="desc">
              <span class="state">${this.hass!.formatEntityState?.(weather) ?? weather.state}</span>
              ${sub ? html`<span class="sub">${sub}</span>` : nothing}
            </span>
          </div>
          ${details.length ? html`<div class="details">${details.map(([icon, text]) => html`
            <span class="detail"><ha-icon icon=${icon}></ha-icon><span>${text}</span></span>`)}</div>` : nothing}
          ${this.renderWarnings()}
        </div>
        ${days.length ? this.renderDays(days, now, unit, today) : nothing}
      </div>
    </div>`
  }

  private renderDays(days: ReturnType<typeof forecastDays>, now: number | undefined, unit: string, today?: (typeof days)[number]) {
    const temps = days.flatMap(d => [d.low, d.high]).filter((n): n is number => n !== undefined)
    if (!temps.length) return nothing
    const min = Math.min(...temps)
    const max = Math.max(...temps)
    const span = max - min || 1
    const pos = (n: number) => `${((n - min) / span) * 100}%`
    // A rain column only when some day is likely to be wet
    const rain = days.some(d => (d.precipitation_probability ?? 0) >= 30)
    return html`<div class="days ${rain ? 'wet' : ''}">${days.map(d => {
      const isToday = d === today
      const label = isToday ? t(this.hass, 'today') : new Date(`${d.date}T12:00:00`).toLocaleDateString(this.language, { weekday: 'short' }).replace(/\.$/, '')
      const low = d.low ?? d.high
      const high = d.high ?? d.low
      return html`<div class="day ${isToday ? 'today' : ''}">
        <span class="weekday">${label}</span>
        <ha-icon class=${conditionTone(d.condition)} icon=${conditionIcon(d.condition)}></ha-icon>
        ${rain ? html`<span class="rain">${(d.precipitation_probability ?? 0) >= 30 ? `${Math.round(d.precipitation_probability!)} %` : ''}</span>` : nothing}
        <span class="low">${this.temp(low)}°</span>
        <span class="track">${low !== undefined && high !== undefined ? html`
          <span class="fill" style="left:${pos(low)};width:${((high - low) / span) * 100}%;background:linear-gradient(90deg, ${temperatureColor(low, unit)}, ${temperatureColor(high, unit)})"></span>
          ${isToday && now !== undefined && now >= min && now <= max ? html`<span class="mark" style="left:${pos(now)}"></span>` : nothing}` : nothing}</span>
        <span class="high">${this.temp(high)}°</span>
      </div>`
    })}</div>`
  }
}
