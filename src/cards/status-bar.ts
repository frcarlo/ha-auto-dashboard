// Home page glance chips, after HArmony's StatusBarWidget.vue, with who is home and the alarm in front.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { allEntities, batteryEntities, deviceName, entityAreaId, entityIndex, hideOf, homeStatus, unavailableDevices, type StatusKey } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import { peopleIds, peopleStyles, renderPeople } from './people'
import type { HassEntity } from '../types'

interface StatusBarConfig extends BaseConfig {
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
  /** Only count entities in these areas (dashboard filtered to rooms or floors) */
  areas?: string[]
  /** Status keys whose list ends with a link to a view showing all of them */
  links?: Partial<Record<StatusKey, string>>
}

const ICONS: Record<StatusKey, string> = {
  lights: 'mdi:lightbulb-group',
  openings: 'mdi:window-open-variant',
  unlocked: 'mdi:lock-open-variant-outline',
  heating: 'mdi:fire',
  media: 'mdi:play-circle',
  battery: 'mdi:battery-alert-variant-outline',
  unavailable: 'mdi:lan-disconnect',
}

const COLORS: Record<StatusKey, string> = {
  lights: 'warning', openings: 'warning', unlocked: 'warning', heating: 'warning',
  media: 'primary', battery: 'error', unavailable: 'muted',
}

export class AdStatusBar extends BaseCard<StatusBarConfig> {
  static properties = { ...BaseCard.properties, open: { state: true } }
  open: StatusKey | null = null

  static styles = [tokens, peopleStyles, css`
    :host { display: block; }
    .chips { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    /* People first, then a hairline, then what is going on */
    .sep { display: none; }
    .chips .people + .sep { display: block; flex: 0 0 1px; align-self: stretch; margin: 4px 4px; background: rgba(var(--ad-on-surface), 0.12); }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 7px 12px 7px 9px; border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
      font-size: 13px; transition: background 0.2s ease;
    }
    :host([glass]) .chip { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .chip ha-icon { --mdc-icon-size: 17px; }
    .chip .n { font-weight: 600; }
    .chip .l { opacity: 0.65; }
    .chip.warning ha-icon { color: rgb(var(--ad-warning)); }
    .chip.primary ha-icon { color: rgb(var(--ad-primary)); }
    .chip.error ha-icon { color: rgb(var(--ad-error)); }
    .chip.muted ha-icon { opacity: 0.5; }
    .chip[aria-expanded=true] { background: var(--ad-surface-variant); }
    .chip:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .quiet { cursor: default; }
    .quiet ha-icon { color: rgb(var(--ad-success)); }
    .list { margin-top: 8px; padding: 6px; border-radius: 20px; display: flex; flex-direction: column; gap: 2px; }
    .item { all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; cursor: pointer; font-size: 13px; }
    .item:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .item ha-icon { --mdc-icon-size: 18px; opacity: 0.6; }
    .item .a { opacity: 0.45; font-size: 12px; white-space: nowrap; }
    .item .s { margin-left: auto; opacity: 0.55; font-size: 12px; white-space: nowrap; }
    .more { all: unset; align-self: flex-end; display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 12px; cursor: pointer; font-size: 12px; color: rgb(var(--ad-primary)); }
    .more:hover { background: rgba(var(--ad-primary), 0.1); }
    .more ha-icon { --mdc-icon-size: 16px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  protected watched() {
    const { areas, hide_labels: labels, hide_entities: hidden } = this.config!
    return [...entityIndex(this.hass!, labels).all, ...batteryEntities(this.hass!, areas, labels, hidden).map(e => e.entity_id), ...peopleIds(this.hass!, this.config!)]
  }

  private areaName(entity: HassEntity) {
    // A dashboard for one room needs no room names in the list
    if (this.config?.areas?.length === 1) return undefined
    return this.hass!.areas[entityAreaId(this.hass!, entity.entity_id) ?? '']?.name
  }

  protected render() {
    const { hide_labels: labels, hide_entities: hidden, areas } = this.config!
    const hide = hideOf(this.config!)
    const items = homeStatus(allEntities(this.hass!, hide, areas), batteryEntities(this.hass!, areas, labels, hidden), unavailableDevices(this.hass!, hide, areas))
    const openItem = items.find(i => i.key === this.open)
    const link = openItem && this.config!.links?.[openItem.key]
    return html`
      <div class="chips">
        ${renderPeople(this.hass!, this.config!, id => this.moreInfo(id))}
        <span class="sep"></span>
        ${items.length ? items.map(item => html`
          <button class="chip ${COLORS[item.key]}" aria-expanded=${this.open === item.key} @click=${() => (this.open = this.open === item.key ? null : item.key)}>
            <ha-icon icon=${ICONS[item.key]}></ha-icon>
            <span class="n">${item.entities.length}</span>
            <span class="l">${t(this.hass, `status.${item.key}`)}</span>
          </button>`)
        : html`<span class="chip quiet"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span class="l">${t(this.hass, 'all_quiet')}</span></span>`}
      </div>
      ${openItem ? html`<div class="list card">
        ${openItem.entities.map(e => {
          const area = this.areaName(e)
          const name = shortName(this.open === 'unavailable' ? deviceName(this.hass!, e) : entityName(e), area)
          return html`
            <button class="item" @click=${() => this.moreInfo(e.entity_id)}>
              <ha-icon icon=${entityIcon(e)}></ha-icon>
              <span>${name}</span>
              ${area && area !== name ? html`<span class="a">${area}</span>` : nothing}
              <span class="s">${this.hass!.formatEntityState?.(e) ?? e.state}</span>
            </button>`
        })}
        ${link ? html`<button class="more" @click=${() => this.navigate(link)}>
          ${t(this.hass, 'show_all')}<ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>` : nothing}
      </div>` : nothing}
    `
  }
}
