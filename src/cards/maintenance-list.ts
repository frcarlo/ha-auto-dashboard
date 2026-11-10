// Maintenance page lists: batteries (lowest first), devices that are gone, pending updates.
// The card collects its entities itself, so devices that drop out later show up without reloading.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { LOW_BATTERY, batteryEntities, deviceName, entityAreaId, hideOf, pendingUpdates, unavailableDevices } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface MaintenanceConfig extends BaseConfig {
  source: 'battery' | 'unavailable' | 'updates'
  areas?: string[]
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

/** Rows shown before the list is opened */
const MAX_ROWS = 6

export class AdMaintenanceList extends BaseCard<MaintenanceConfig> {
  static properties = {
    ...BaseCard.properties,
    expanded: { state: true },
  }

  /** The whole list instead of the first rows */
  expanded = false

  static styles = [tokens, css`
    :host { display: block; }
    .card { padding: 6px; display: flex; flex-direction: column; gap: 2px; }
    .item { all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; cursor: pointer; font-size: 13px; }
    .item:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .item:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .item ha-icon { --mdc-icon-size: 18px; opacity: 0.6; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .area { font-size: 11px; opacity: 0.5; }
    .s { opacity: 0.6; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .s.error { color: rgb(var(--ad-error)); opacity: 1; font-weight: 600; }
    .s.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .empty { display: flex; align-items: center; gap: 10px; padding: 10px; font-size: 13px; opacity: 0.6; }
    .empty ha-icon { color: rgb(var(--ad-success)); }
    .more { all: unset; display: inline-flex; align-items: center; gap: 2px; align-self: flex-start; margin: 2px 10px 6px; font-size: 12px; color: rgb(var(--ad-primary)); cursor: pointer; }
    .more ha-icon { --mdc-icon-size: 16px; }
    .more:focus-visible { outline: 2px solid rgb(var(--ad-primary)); border-radius: 6px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 3
  }

  private items(): HassEntity[] {
    const { source, areas, hide_labels: labels, hide_entities: hidden } = this.config!
    if (source === 'battery') {
      return batteryEntities(this.hass!, areas, labels, hidden)
        .filter(e => e.state !== '' && Number.isFinite(Number(e.state)))
        .sort((a, b) => Number(a.state) - Number(b.state))
    }
    if (source === 'unavailable') return unavailableDevices(this.hass!, hideOf(this.config!), areas)
    return pendingUpdates(this.hass!, labels)
  }

  protected watched() {
    // Any state can flip a device to unavailable; the other lists only watch their own entities
    return this.config!.source === 'unavailable' ? Object.keys(this.hass!.states) : this.items().map(e => e.entity_id)
  }

  private row(e: HassEntity) {
    const source = this.config!.source
    const area = this.hass!.areas[entityAreaId(this.hass!, e.entity_id) ?? '']?.name
    const name = source === 'unavailable' ? deviceName(this.hass!, e) : entityName(e)
    let value: string
    let color = ''
    if (source === 'battery') {
      const level = Number(e.state)
      value = `${Math.round(level)} %`
      color = level < LOW_BATTERY ? 'error' : level < 40 ? 'warning' : ''
    } else if (source === 'updates') {
      value = [e.attributes.installed_version, e.attributes.latest_version].filter(Boolean).join(' → ')
    } else {
      value = this.hass!.formatEntityState?.(e) ?? e.state
    }
    return html`<button class="item" @click=${() => this.moreInfo(e.entity_id)}>
      <ha-icon icon=${source === 'updates' ? 'mdi:package-up' : entityIcon(e)}></ha-icon>
      <span class="text"><span class="name">${shortName(name, area)}</span>${area ? html`<span class="area">${area}</span>` : nothing}</span>
      <span class="s ${color}">${value}</span>
    </button>`
  }

  protected render() {
    const items = this.items()
    return html`<div class="card">
      ${items.length ? (this.expanded ? items : items.slice(0, MAX_ROWS)).map(e => this.row(e))
        : html`<div class="empty"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${t(this.hass, 'all_good')}</div>`}
      ${items.length > MAX_ROWS ? html`<button class="more" aria-expanded=${this.expanded} @click=${() => (this.expanded = !this.expanded)}>
        <ha-icon icon=${this.expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>${this.expanded ? t(this.hass, 'list.less') : t(this.hass, 'list.more', { n: items.length })}</button>` : nothing}
    </div>`
  }
}
