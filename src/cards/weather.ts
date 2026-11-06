// Weather on Home: now (measured by the house's own sensors where configured), the details in one line, warnings,
// and the next days side by side, so the card stays low and the rooms come into view on a tablet.
// HA keeps forecasts out of the state, so the card subscribes to them like HA's own weather card.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { tokens } from '../styles/tokens'
import type { HassEntity, WeatherSensorKey } from '../types'
import {
  activeWarnings, compass, conditionIcon, conditionTone, forecastDays, forecastType, todayDate,
  type ForecastEntry, type Warning,
} from '../weather'

interface WeatherConfig extends BaseConfig {
  entity: string
  /** Warning entities (NINA, DWD); without them there is no warning line */
  warnings?: string[]
  /** Sensors at the house; each replaces the forecast service's value */
  sensors?: Partial<Record<WeatherSensorKey, string>>
  /** Days of forecast, 3 by default, 0 for none */
  days?: number
}

interface Detail {
  icon: string
  text: string
  /** Measured by this sensor: a tap shows its history */
  sensor?: string
}

export class AdWeather extends BaseCard<WeatherConfig> {
  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    .card { padding: 16px; cursor: pointer; }
    .card:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .layout { display: grid; gap: 16px; }
    .now { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

    .top { display: flex; align-items: center; gap: 12px; }
    .cond { --mdc-icon-size: 48px; flex: 0 0 auto; color: rgba(var(--ad-on-surface), 0.7); }
    .cond.sun, .cond.storm { color: rgb(var(--ad-warning)); }
    .cond.wet { color: rgb(var(--ad-info)); }
    .temp { all: unset; font-size: 48px; font-weight: 200; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
    .temp small { font-size: 20px; font-weight: 300; opacity: 0.5; margin-left: 2px; vertical-align: top; letter-spacing: 0; }
    .desc { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; margin-left: 4px; }
    /* Long conditions ("Teilweise bewölkt") wrap rather than lose their end */
    .state { font-size: 16px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .sub { font-size: 13px; opacity: 0.6; font-variant-numeric: tabular-nums; }

    .details { display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .detail { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap; min-width: 0; }
    button.detail { cursor: pointer; }
    button.detail:focus-visible, button.temp:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; border-radius: 4px; }
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

    /* The next days side by side: weekday, sky, high and low */
    .days {
      display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px;
      padding-top: 12px; border-top: 1px solid rgba(var(--ad-on-surface), 0.08);
    }
    .day { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; border-radius: 12px; font-size: 13px; font-variant-numeric: tabular-nums; }
    .day.today { background: rgba(var(--ad-on-surface), 0.05); }
    .weekday { font-size: 12px; opacity: 0.7; }
    .day.today .weekday { opacity: 1; font-weight: 500; }
    .day ha-icon { --mdc-icon-size: 22px; color: rgba(var(--ad-on-surface), 0.6); }
    .day ha-icon.sun, .day ha-icon.storm { color: rgb(var(--ad-warning)); }
    .day ha-icon.wet { color: rgb(var(--ad-info)); }
    .temps { display: flex; gap: 6px; white-space: nowrap; }
    .low { opacity: 0.55; }
    .rain { font-size: 11px; line-height: 14px; min-height: 14px; color: rgb(var(--ad-info)); }

    @container (max-width: 400px) {
      .cond { --mdc-icon-size: 40px; }
      .temp { font-size: 40px; }
    }
    /* Wide: now on the left, the days on the right */
    @container (min-width: 600px) {
      .layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 24px; align-items: center; }
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

  protected watched() {
    return [this.config!.entity, ...(this.config!.warnings ?? []), ...Object.values(this.config!.sensors ?? {})]
  }

  /** A configured sensor's number, or nothing while it is missing or unavailable. */
  private reading(key: WeatherSensorKey): { entity: HassEntity; n: number; text: string } | undefined {
    const entity = this.state(this.config!.sensors?.[key])
    if (!entity || entity.state === '' || !Number.isFinite(Number(entity.state))) return undefined
    const { value, unit } = this.value(entity)
    return { entity, n: Number(entity.state), text: unit ? `${value} ${unit}` : value }
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
    // Sensors at the house know what it is like here better than a forecast service
    const temperature = this.reading('temperature')
    const now: number | undefined = temperature?.n ?? a.temperature
    const unit = String(temperature?.entity.attributes.unit_of_measurement ?? a.temperature_unit ?? '°C')
    const days = forecastDays(this.forecast ?? a.forecast).slice(0, c.days ?? 3)
    const today = days[0]?.date === todayDate() ? days[0] : undefined
    const points = t(this.hass, 'compass').split(',')

    const humidity = this.reading('humidity')
    const wind = this.reading('wind_speed')
    const bearing = this.reading('wind_bearing')
    const dir = compass(bearing?.n ?? a.wind_bearing, points)
    const pressure = this.reading('pressure')
    const rain = this.reading('rain')
    const light = this.reading('illuminance')
    const details: Detail[] = [
      humidity ? { icon: 'mdi:water-percent', text: humidity.text, sensor: humidity.entity.entity_id }
        : a.humidity !== undefined ? { icon: 'mdi:water-percent', text: `${this.number(a.humidity, 0)} %` } : undefined,
      wind ? { icon: 'mdi:weather-windy', text: `${wind.text}${dir ? ` ${dir}` : ''}`, sensor: wind.entity.entity_id }
        : a.wind_speed !== undefined ? { icon: 'mdi:weather-windy', text: `${this.temp(a.wind_speed)} ${a.wind_speed_unit ?? ''}${dir ? ` ${dir}` : ''}` } : undefined,
      pressure ? { icon: 'mdi:gauge', text: pressure.text, sensor: pressure.entity.entity_id }
        : a.pressure !== undefined ? { icon: 'mdi:gauge', text: `${this.number(a.pressure, 0)} ${a.pressure_unit ?? ''}` } : undefined,
      rain ? { icon: 'mdi:weather-pouring', text: rain.text, sensor: rain.entity.entity_id } : undefined,
      light ? { icon: 'mdi:brightness-5', text: light.text, sensor: light.entity.entity_id } : undefined,
      a.visibility !== undefined ? { icon: 'mdi:eye-outline', text: `${this.temp(a.visibility)} ${a.visibility_unit ?? ''}` } : undefined,
      a.uv_index !== undefined ? { icon: 'mdi:white-balance-sunny', text: `UV ${this.number(a.uv_index, 0)}` } : undefined,
    ].filter((d): d is Detail => !!d).slice(0, 6)

    const sub = [
      today?.high !== undefined && today.low !== undefined ? `↑ ${this.temp(today.high)}°  ↓ ${this.temp(today.low)}°` : undefined,
      // Measured here: what the service says next to it, so a sensor in the sun or indoors shows up
      temperature && a.temperature !== undefined ? t(this.hass, 'service_value', { t: `${this.temp(a.temperature)}°` })
        : a.apparent_temperature !== undefined && Math.round(a.apparent_temperature) !== Math.round(Number(now)) ? t(this.hass, 'feels_like', { t: `${this.temp(a.apparent_temperature)}°` }) : undefined,
    ].filter((x): x is string => !!x)
    const open = (id: string) => (e: Event) => { e.stopPropagation(); this.moreInfo(id) }

    return html`<div class="card" role="button" tabindex="0" aria-label=${t(this.hass, 'weather')}
      @click=${() => this.moreInfo(weather.entity_id)} @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.moreInfo(weather.entity_id)}>
      <div class="layout">
        <div class="now">
          <div class="top">
            <ha-icon class="cond ${conditionTone(weather.state)}" icon=${conditionIcon(weather.state)}></ha-icon>
            ${temperature ? html`<button class="temp" @click=${open(temperature.entity.entity_id)}>${this.temp(now)}<small>${unit}</small></button>`
              : html`<span class="temp">${this.temp(now)}<small>${unit}</small></span>`}
            <span class="desc">
              <span class="state">${this.hass!.formatEntityState?.(weather) ?? weather.state}</span>
              ${sub.map(line => html`<span class="sub">${line}</span>`)}
            </span>
          </div>
          ${details.length ? html`<div class="details">${details.map(d => d.sensor
            ? html`<button class="detail" @click=${open(d.sensor)}><ha-icon icon=${d.icon}></ha-icon><span>${d.text}</span></button>`
            : html`<span class="detail"><ha-icon icon=${d.icon}></ha-icon><span>${d.text}</span></span>`)}</div>` : nothing}
          ${this.renderWarnings()}
        </div>
        ${days.length ? this.renderDays(days, today) : nothing}
      </div>
    </div>`
  }

  private renderDays(days: ReturnType<typeof forecastDays>, today?: ReturnType<typeof forecastDays>[number]) {
    // A rain line only when some day is likely to be wet
    const rain = days.some(d => (d.precipitation_probability ?? 0) >= 30)
    return html`<div class="days">${days.map(d => {
      const isToday = d === today
      const label = isToday ? t(this.hass, 'today') : new Date(`${d.date}T12:00:00`).toLocaleDateString(this.language, { weekday: 'short' }).replace(/\.$/, '')
      return html`<div class="day ${isToday ? 'today' : ''}">
        <span class="weekday">${label}</span>
        <ha-icon class=${conditionTone(d.condition)} icon=${conditionIcon(d.condition)}></ha-icon>
        <span class="temps"><span class="high">${this.temp(d.high ?? d.low)}°</span><span class="low">${this.temp(d.low ?? d.high)}°</span></span>
        ${rain ? html`<span class="rain">${(d.precipitation_probability ?? 0) >= 30 ? `${Math.round(d.precipitation_probability!)} %` : ''}</span>` : nothing}
      </div>`
    })}</div>`
  }
}
