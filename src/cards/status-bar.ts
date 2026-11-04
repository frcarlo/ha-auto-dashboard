// Home page glance chips, after HArmony's StatusBarWidget.vue.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { allEntities, batteryEntities, entityIndex, homeStatus, type StatusKey } from '../model'
import { entityIcon, entityName } from '../presentation'
import { tokens } from '../styles/tokens'

interface StatusBarConfig extends BaseConfig {
  hide_domains?: string[]
  /** Which status keys jump to a view instead of listing their entities */
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

  static styles = [tokens, css`
    :host { display: block; }
    .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 7px 12px 7px 9px; border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
      font-size: 13px; transition: background 0.2s ease;
    }
    :host([glass]) .chip { background: var(--ad-glass-bg); }
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
    .item .s { margin-left: auto; opacity: 0.55; font-size: 12px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  protected watched() {
    return [...entityIndex(this.hass!).all, ...batteryEntities(this.hass!).map(e => e.entity_id)]
  }

  private select(key: StatusKey) {
    const link = this.config?.links?.[key]
    if (link) return this.navigate(link)
    this.open = this.open === key ? null : key
  }

  protected render() {
    const items = homeStatus(allEntities(this.hass!, this.config!.hide_domains), batteryEntities(this.hass!))
    const openItem = items.find(i => i.key === this.open)
    return html`
      <div class="chips">
        ${items.length ? items.map(item => html`
          <button class="chip ${COLORS[item.key]}" aria-expanded=${this.open === item.key} @click=${() => this.select(item.key)}>
            <ha-icon icon=${ICONS[item.key]}></ha-icon>
            <span class="n">${item.entities.length}</span>
            <span class="l">${t(this.hass, `status.${item.key}`)}</span>
          </button>`)
        : html`<span class="chip quiet"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span class="l">${t(this.hass, 'all_quiet')}</span></span>`}
      </div>
      ${openItem ? html`<div class="list card">
        ${openItem.entities.map(e => html`
          <button class="item" @click=${() => this.moreInfo(e.entity_id)}>
            <ha-icon icon=${entityIcon(e)}></ha-icon>
            <span>${entityName(e)}</span>
            <span class="s">${this.hass!.formatEntityState?.(e) ?? e.state}</span>
          </button>`)}
      </div>` : nothing}
    `
  }
}
