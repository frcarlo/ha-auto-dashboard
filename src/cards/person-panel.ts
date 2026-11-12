// A person's phones, tablets and watches under the status bar, opened by a tap on their picture: one tile per
// device with battery, charging and where it is; a tap on a tile shows everything the device reports.
import { css, html, nothing, type TemplateResult } from 'lit'
import { t, type Key } from '../i18n'
import { entityName } from '../presentation'
import { batteryLevel, isCharging, lastSeen, phonePlace, readingOf, type Phone, type PhoneKind, type Reading } from '../phones'
import type { HassEntity, HomeAssistant } from '../types'

const KIND_ICONS: Record<PhoneKind, string> = { phone: 'mdi:cellphone', tablet: 'mdi:tablet', watch: 'mdi:watch-variant' }

/** Rows of the detail card, in this order; each only when the device reports it */
const DETAIL_ROWS: [Reading, string][] = [
  ['location', 'mdi:map-marker-outline'],
  ['alarm', 'mdi:alarm'],
  ['steps', 'mdi:shoe-print'],
  ['activity', 'mdi:walk'],
  ['wifi', 'mdi:wifi'],
  ['network', 'mdi:signal'],
  ['health', 'mdi:battery-heart-variant'],
  ['cycles', 'mdi:battery-sync-outline'],
  ['charger', 'mdi:power-plug-outline'],
  ['storage', 'mdi:harddisk'],
  ['os', 'mdi:cellphone-cog'],
  ['app', 'mdi:home-assistant'],
]

export interface PanelHandlers {
  /** Device whose details are open */
  open?: string
  pick: (deviceId: string) => void
  moreInfo: (entityId: string) => void
  now: number
}

function ago(hass: HomeAssistant, ms: number, now: number) {
  const minutes = Math.round((ms - now) / 60_000)
  const format = new Intl.RelativeTimeFormat(hass.locale?.language ?? hass.language, { numeric: 'auto', style: 'short' })
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  if (Math.abs(minutes) < 48 * 60) return format.format(Math.round(minutes / 60), 'hour')
  return format.format(Math.round(minutes / 1440), 'day')
}

function batteryIcon(level: number | undefined, charging: boolean) {
  if (level === undefined) return 'mdi:battery-unknown'
  const step = Math.min(100, Math.max(10, Math.round(level / 10) * 10))
  if (charging) return `mdi:battery-charging-${step}`
  return step === 100 ? 'mdi:battery' : `mdi:battery-${step}`
}

const level = (n: number | undefined) => (n === undefined ? '' : n <= 15 ? 'low' : n <= 30 ? 'mid' : 'ok')

function placeText(hass: HomeAssistant, phone: Phone) {
  const place = phonePlace(hass, phone)
  if (!place) return undefined
  if (place.zone === 'home') return t(hass, 'home_state')
  return place.text ?? t(hass, 'away')
}

/** HA's own words for a state; a time for the alarm */
function readingText(hass: HomeAssistant, reading: Reading, e: HassEntity) {
  if (reading === 'alarm') {
    const at = Date.parse(e.state)
    if (Number.isFinite(at)) {
      const lang = hass.locale?.language ?? hass.language
      return new Date(at).toLocaleString(lang, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }
  }
  return hass.formatEntityState?.(e) ?? `${e.state}${e.attributes.unit_of_measurement ? ` ${e.attributes.unit_of_measurement}` : ''}`
}

function tile(hass: HomeAssistant, phone: Phone, h: PanelHandlers) {
  const battery = batteryLevel(hass, phone)
  const charging = isCharging(hass, phone)
  const seen = lastSeen(hass, phone)
  const place = placeText(hass, phone)
  return html`<button class="phone ${h.open === phone.device_id ? 'open' : ''}" aria-expanded=${h.open === phone.device_id} @click=${() => h.pick(phone.device_id)}>
    <span class="top">
      <ha-icon class="kind" icon=${KIND_ICONS[phone.kind]}></ha-icon>
      ${battery !== undefined ? html`<span class="bat ${level(battery)} ${charging ? 'charging' : ''}">
        <ha-icon icon=${batteryIcon(battery, charging)}></ha-icon>${Math.round(battery)} %</span>` : nothing}
    </span>
    <span class="pname">${phone.name}</span>
    <span class="meta">${[place, seen ? ago(hass, seen, h.now) : ''].filter(Boolean).join(' · ')}</span>
    ${battery !== undefined ? html`<span class="bar"><span class=${level(battery)} style="width:${Math.max(3, Math.min(100, battery))}%"></span></span>` : nothing}
  </button>`
}

function details(hass: HomeAssistant, phone: Phone, h: PanelHandlers): TemplateResult {
  const battery = readingOf(hass, phone, 'battery')
  const state = readingOf(hass, phone, 'battery_state')
  const rows = DETAIL_ROWS.map(([reading, icon]) => ({ reading, icon, e: readingOf(hass, phone, reading) })).filter(r => r.e)
  return html`<div class="detail">
    <div class="dhead">
      <ha-icon icon=${KIND_ICONS[phone.kind]}></ha-icon>
      <span class="dname">${phone.name}</span>
      <button class="link" @click=${() => h.moreInfo(phone.tracker)}>${t(hass, 'phone.map')}<ha-icon icon="mdi:chevron-right"></ha-icon></button>
    </div>
    <div class="rows">
      ${battery ? html`<button class="row" @click=${() => h.moreInfo(battery.entity_id)}>
        <ha-icon icon=${batteryIcon(batteryLevel(hass, phone), isCharging(hass, phone))}></ha-icon>
        <span class="k">${t(hass, 'phone.battery')}</span>
        <span class="v">${[readingText(hass, 'battery', battery), state ? readingText(hass, 'battery_state', state) : ''].filter(Boolean).join(' · ')}</span>
      </button>` : nothing}
      ${rows.map(({ reading, icon, e }) => html`<button class="row ${reading === 'location' ? 'wide' : ''}" @click=${() => h.moreInfo(e!.entity_id)}>
        <ha-icon icon=${icon}></ha-icon>
        <span class="k">${t(hass, `phone.${reading}` as Key)}</span>
        <span class="v">${readingText(hass, reading, e!)}</span>
      </button>`)}
    </div>
  </div>`
}

/** The person's devices; with one open, its details beneath the tiles */
export function renderPersonPanel(hass: HomeAssistant, person: HassEntity, phones: Phone[], h: PanelHandlers) {
  const open = phones.find(p => p.device_id === h.open)
  const where = person.state === 'home' ? t(hass, 'home_state') : person.state === 'not_home' ? t(hass, 'away') : hass.formatEntityState?.(person) ?? person.state
  return html`<div class="list card panel">
    <div class="phead">
      <span class="who">${entityName(person)}</span><span class="where">${where}</span>
      <button class="link" @click=${() => h.moreInfo(person.entity_id)}>${t(hass, 'phone.person')}<ha-icon icon="mdi:chevron-right"></ha-icon></button>
    </div>
    <div class="phones">${phones.map(p => tile(hass, p, h))}</div>
    ${open ? details(hass, open, h) : nothing}
  </div>`
}

export const personPanelStyles = css`
  .panel { padding: 12px; gap: 10px; }
  .phead { display: flex; align-items: baseline; gap: 8px; padding: 0 4px; }
  .phead .who { font-size: var(--ad-fs-m); font-weight: 600; }
  .phead .where { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
  .link {
    all: unset; margin-left: auto; display: inline-flex; align-items: center; gap: 2px; padding: 4px 8px; border-radius: 10px; cursor: pointer;
    font-size: var(--ad-fs-s); color: rgb(var(--ad-primary)); white-space: nowrap;
  }
  .link:hover { background: rgba(var(--ad-primary), 0.1); }
  .link ha-icon { --mdc-icon-size: 16px; }
  .phones { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .phone {
    all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px 12px; cursor: pointer; min-width: 0;
    border-radius: 16px; background: rgba(var(--ad-on-surface), 0.05);
  }
  .phone:hover { background: rgba(var(--ad-on-surface), 0.09); }
  .phone.open { background: rgba(var(--ad-primary), 0.14); box-shadow: inset 0 0 0 1.5px rgba(var(--ad-primary), 0.5); }
  .phone:focus-visible, .row:focus-visible, .link:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .kind { --mdc-icon-size: 20px; opacity: var(--ad-o2); }
  .bat { display: inline-flex; align-items: center; gap: 2px; font-size: var(--ad-fs-s); font-weight: 600; font-variant-numeric: tabular-nums; }
  .bat ha-icon { --mdc-icon-size: 16px; }
  .bat.low { color: rgb(var(--ad-error)); }
  .bat.charging ha-icon { color: rgb(var(--ad-success)); }
  .pname { font-size: var(--ad-fs-m); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: var(--ad-fs-xs); opacity: var(--ad-o2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 4px; margin-top: 4px; border-radius: 2px; background: rgba(var(--ad-on-surface), 0.1); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 2px; background: rgb(var(--ad-success)); }
  .bar .mid { background: rgb(var(--ad-warning)); }
  .bar .low { background: rgb(var(--ad-error)); }
  .detail { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px 0; border-top: 1px solid rgba(var(--ad-on-surface), 0.08); }
  .dhead { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .dhead > ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); }
  .dname { font-size: var(--ad-fs-m); font-weight: 600; }
  .rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 12px; }
  .row { all: unset; display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-radius: 12px; cursor: pointer; font-size: var(--ad-fs-s); min-width: 0; }
  .row:hover { background: rgba(var(--ad-on-surface), 0.06); }
  /* An address is long; it gets the whole width instead of being cut off */
  .row.wide { grid-column: 1 / -1; }
  .row ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); flex: none; }
  .row .k { opacity: var(--ad-o2); white-space: nowrap; }
  .row .v { margin-left: auto; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
