// The rooms on Home one floor at a time, with the floors as tabs above them, for houses where all floors
// at once push the rooms of the lower ones out of view. Home opens on the start floor if one is set,
// otherwise on the one picked last on this device.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { areaEntities, hideOf } from '../model'
import { tokens } from '../styles/tokens'
import { scrollRow } from '../scroll-row'

interface FloorTab {
  id: string
  name: string
  icon?: string
  /** Room card configs, as the strategy builds them for the floor sections */
  rooms: (BaseConfig & { area: string; hide_domains?: string[]; hide_labels?: string[]; hide_entities?: string[] })[]
}

interface FloorTabsConfig extends BaseConfig {
  floors: FloorTab[]
  /** The floor to open on every load, instead of the one picked last */
  start?: string
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
    /* The heading as on the favorites above, so the rooms read as a section of their own and not as a filter */
    .head { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 10px 4px 6px; font-size: var(--ad-fs-l); font-weight: 500; }
    .head ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o3); }
    /*
     * The tabs and the rooms of the picked floor on one surface, like a folder with its tabs, so it is clear the
     * cards below belong to the tab. The surface is a layer behind the content: blur on the panel itself would make
     * it the backdrop of the room cards, and their own glass would then blur only the panel.
     */
    .panel { position: relative; isolation: isolate; border-radius: var(--ad-radius); padding: 8px 8px 8px; }
    /*
     * Without glass the panel is solid like the cards around it, a shade off their surface so the room cards stand
     * out on it. A see-through tint would let a background picture show through here alone.
     */
    .panel::before {
      content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
      background: var(--ad-surface-variant);
      background: color-mix(in srgb, var(--ad-surface) 94%, rgb(var(--ad-on-surface)));
      box-shadow: var(--ad-shadow), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08);
    }
    :host([glass]) .panel::before {
      background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur);
      box-shadow: var(--ad-glass-shadow), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.1), inset 0 1px 0 var(--ad-glass-hi);
    }
    .tabs { position: relative; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 10px; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
      padding: 0 14px 0 12px; cursor: pointer; border-radius: 999px; font-size: var(--ad-fs-m); font-weight: 500; white-space: nowrap;
      background: rgba(var(--ad-on-surface), 0.08); transition: background 0.15s ease, box-shadow 0.15s ease;
    }
    .tab:hover { background: rgba(var(--ad-on-surface), 0.14); }
    .tab:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .tab ha-icon { --mdc-icon-size: 20px; opacity: var(--ad-o2); }
    /* How many rooms the floor has: quiet, in a small pill of its own */
    .n {
      min-width: 22px; box-sizing: border-box; padding: 1px 7px; border-radius: 999px; text-align: center;
      font-size: var(--ad-fs-xs); font-weight: 600; font-variant-numeric: tabular-nums; background: rgba(var(--ad-on-surface), 0.1);
    }
    /*
     * Tinted like the nav bar's current page, not filled: a light accent (yellow, mint) would glare and swallow
     * the name. The ring keeps it apart from the others on a busy background picture.
     */
    .tab[aria-selected=true] {
      background: rgba(var(--ad-primary), 0.3); box-shadow: inset 0 0 0 1.5px rgba(var(--ad-primary), 0.75); font-weight: 600;
    }
    .tab[aria-selected=true] ha-icon { opacity: 1; color: rgb(var(--ad-primary)); }
    .tab[aria-selected=true] .n { background: rgba(var(--ad-primary), 0.35); }
    /* Lights on on that floor, and how many */
    .lit { display: inline-flex; align-items: center; gap: 2px; font-size: var(--ad-fs-s); font-weight: 600; color: rgb(var(--ad-warning)); font-variant-numeric: tabular-nums; }
    .tab .lit ha-icon { --mdc-icon-size: 16px; opacity: 1; color: inherit; }
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
    return floors.find(f => f.id === (this.current ?? this.config!.start ?? stored())) ?? floors[0]!
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

  /** Lights on on the floor */
  private lit(floor: FloorTab) {
    return floor.rooms.reduce((n, room) => n + areaEntities(this.hass!, room.area, hideOf(room))
      .filter(e => e.entity_id.startsWith('light.') && e.state === 'on').length, 0)
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
      <div class="head"><ha-icon icon="mdi:floor-plan"></ha-icon><span>${t(this.hass, 'rooms')}</span></div>
      <div class="panel">
        <div class="tabs" ${scrollRow()} role="tablist" aria-label=${t(this.hass, 'floors')} @keydown=${this.keys}>
          ${floors.map(f => {
            const lit = this.lit(f)
            return html`<button class="tab" role="tab" aria-selected=${f === selected} tabindex=${f === selected ? 0 : -1}
              aria-label=${t(this.hass, 'floor.tab', { name: f.name, n: f.rooms.length, lit })} @click=${() => this.pick(f.id)}>
              ${f.icon ? html`<ha-icon icon=${f.icon}></ha-icon>` : nothing}<span>${f.name}</span>
              <span class="n">${f.rooms.length}</span>
              ${lit ? html`<span class="lit"><ha-icon icon="mdi:lightbulb-on"></ha-icon>${lit}</span>` : nothing}
            </button>`
          })}
        </div>
        <div class="rooms" role="tabpanel">
          ${selected.rooms.map(room => html`<ad-room-card .hass=${this.hass} .config=${room}></ad-room-card>`)}
        </div>
      </div>`
  }
}
