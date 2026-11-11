// The rooms on Home one floor at a time, with the floors as tabs above them, for houses where all floors
// at once push the rooms of the lower ones out of view. The tab picked last stays picked on this device.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { areaEntities, hideOf } from '../model'
import { tokens } from '../styles/tokens'

interface FloorTab {
  id: string
  name: string
  icon?: string
  /** Room card configs, as the strategy builds them for the floor sections */
  rooms: (BaseConfig & { area: string; hide_domains?: string[]; hide_labels?: string[]; hide_entities?: string[] })[]
}

interface FloorTabsConfig extends BaseConfig {
  floors: FloorTab[]
}

const storageKey = () => `ad-floor-tab:${location.pathname.split('/')[1] ?? ''}`

function stored(): string | undefined {
  try {
    return localStorage.getItem(storageKey()) ?? undefined
  } catch {
    return undefined
  }
}

export class AdFloorTabs extends BaseCard<FloorTabsConfig> {
  static properties = { ...BaseCard.properties, current: { state: true } }
  current?: string

  static styles = [tokens, css`
    :host { display: block; }
    .tabs { position: relative; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 6px 4px 12px; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      all: unset; flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px 8px 12px; cursor: pointer;
      border-radius: 999px; font-size: var(--ad-fs-m); font-weight: 500; white-space: nowrap;
      background: rgba(var(--ad-on-surface), 0.07); transition: background 0.15s ease;
    }
    .tab:hover { background: rgba(var(--ad-on-surface), 0.12); }
    .tab:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .tab ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); }
    .tab[aria-selected=true] { background: rgb(var(--ad-primary)); color: #fff; }
    .tab[aria-selected=true] ha-icon { opacity: 1; }
    /* Lights on somewhere on that floor */
    .lit { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ad-warning)); box-shadow: 0 0 6px rgba(var(--ad-warning), 0.8); }
    /* The same sizes HA gives the room cards in a floor section: two to a column, two rows high */
    .rooms {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--row-gap, 8px) var(--column-gap, 8px); grid-auto-rows: calc(var(--row-height, 56px) * 2 + var(--row-gap, 8px));
    }
  `]

  getCardSize() {
    return 6
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  /** The room cards inside watch their own entities, so every update of hass is passed on to them */
  protected shouldUpdate() {
    return !!this.config && !!this.hass
  }

  private get selected(): FloorTab {
    const floors = this.config!.floors
    return floors.find(f => f.id === (this.current ?? stored())) ?? floors[0]!
  }

  private pick(id: string) {
    this.current = id
    try {
      localStorage.setItem(storageKey(), id)
    } catch {
      // Private window or blocked storage: the tab only holds until the page reloads
    }
  }

  /** On a phone the picked floor may sit beyond the edge of the tab row, so the row scrolls to it */
  protected firstUpdated() {
    const tab = this.renderRoot.querySelector<HTMLElement>('.tab[aria-selected=true]')
    if (tab?.parentElement) tab.parentElement.scrollLeft = tab.offsetLeft - 4
  }

  private lit(floor: FloorTab) {
    return floor.rooms.some(room => areaEntities(this.hass!, room.area, hideOf(room))
      .some(e => e.entity_id.startsWith('light.') && e.state === 'on'))
  }

  private keys(e: KeyboardEvent) {
    const floors = this.config!.floors
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    const next = floors[(floors.indexOf(this.selected) + by + floors.length) % floors.length]!
    this.pick(next.id)
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.tab[aria-selected=true]')?.focus())
  }

  protected render() {
    const floors = this.config!.floors
    const selected = this.selected
    return html`
      <div class="tabs" role="tablist" aria-label=${t(this.hass, 'floors')} @keydown=${this.keys}>
        ${floors.map(f => html`<button class="tab" role="tab" aria-selected=${f === selected} tabindex=${f === selected ? 0 : -1}
          @click=${() => this.pick(f.id)}>
          ${f.icon ? html`<ha-icon icon=${f.icon}></ha-icon>` : nothing}<span>${f.name}</span>${this.lit(f) ? html`<span class="lit"></span>` : nothing}
        </button>`)}
      </div>
      <div class="rooms" role="tabpanel">
        ${selected.rooms.map(room => html`<ad-room-card .hass=${this.hass} .config=${room}></ad-room-card>`)}
      </div>`
  }
}
