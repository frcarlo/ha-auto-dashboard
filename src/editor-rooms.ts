// "Room pages" part of the editor: per room, hide and reorder groups and entities, and add own cards
// at the top, the bottom or the end of a group. Changes go up as a patch of `rooms` and `hide_entities`.
import { LitElement, css, html, nothing } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { t, type Key } from './i18n'
import { arrangeRoom, areaEntities, groupEntities } from './model'
import { entityName, shortName } from './presentation'
import type { CardSlot, GroupKey, HassEntity, HomeAssistant, RoomSettings, StrategyConfig } from './types'

export interface RoomsPatch {
  rooms?: StrategyConfig['rooms']
  hide_entities?: string[]
}

export class AdRoomSettings extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    area: { state: true },
    slot: { state: true },
    yamlError: { state: true },
  }

  hass?: HomeAssistant
  config: StrategyConfig = { type: 'custom:auto-dashboard' }
  area = ''
  slot: CardSlot = 'top'
  yamlError = false

  static styles = css`
    :host { display: flex; flex-direction: column; gap: 14px; }
    select, textarea {
      font: inherit; color: inherit; background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
      border: 1px solid var(--ad-line); border-radius: 10px; padding: 9px 12px;
    }
    select option { color: #111; }
    textarea { min-height: 120px; resize: vertical; font-family: var(--code-font-family, monospace); font-size: 12px; }
    .label { font-size: 12px; color: var(--secondary-text-color, #94a3b8); letter-spacing: 0.02em; }
    .hint { font-size: 12px; color: var(--secondary-text-color, #94a3b8); line-height: 1.4; }
    .error { color: var(--error-color, #ef4444); }
    .group { border: 1px solid var(--ad-line); border-radius: 12px; overflow: hidden; }
    .row { display: flex; align-items: center; gap: 4px; padding: 4px 6px 4px 12px; min-height: 36px; }
    .row.head { background: color-mix(in srgb, var(--ad-line) 40%, transparent); font-weight: 500; }
    .row .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
    .row.off .name { opacity: 0.45; text-decoration: line-through; }
    .row + .row { border-top: 1px solid var(--ad-line); }
    .icon-btn {
      all: unset; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; cursor: pointer;
      color: var(--secondary-text-color, #94a3b8);
    }
    .icon-btn:hover { background: color-mix(in srgb, var(--ad-line) 60%, transparent); }
    .icon-btn[disabled] { opacity: 0.3; pointer-events: none; }
    .icon-btn:focus-visible { outline: 2px solid var(--ad-accent); }
    .icon-btn ha-icon { --mdc-icon-size: 18px; }
    .groups { display: flex; flex-direction: column; gap: 8px; }
    .link { all: unset; cursor: pointer; font-size: 12px; color: var(--ad-accent); align-self: flex-start; }
  `

  private l(key: Key) {
    return t(this.hass, key)
  }

  private get areas() {
    return Object.values(this.hass?.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  }

  private get room(): RoomSettings {
    return this.config.rooms?.[this.area] ?? {}
  }

  private emit(patch: RoomsPatch) {
    this.dispatchEvent(new CustomEvent<RoomsPatch>('rooms-changed', { detail: patch }))
  }

  private setRoom(patch: Partial<RoomSettings>) {
    this.emit({ rooms: { ...(this.config.rooms ?? {}), [this.area]: { ...this.room, ...patch } } })
  }

  /** Groups as the room page shows them, hidden ones included so they can be shown again. */
  private groups(): [GroupKey, HassEntity[]][] {
    const c = this.config
    const entities = areaEntities(this.hass!, this.area, { domains: c.hide_domains, labels: c.hide_labels })
    return arrangeRoom(groupEntities(entities), { ...this.room, hide_groups: [] })
  }

  private moveGroup(groups: GroupKey[], index: number, by: number) {
    const order = [...groups]
    const [key] = order.splice(index, 1)
    order.splice(index + by, 0, key!)
    this.setRoom({ group_order: order })
  }

  private moveEntity(groups: [GroupKey, HassEntity[]][], key: GroupKey, index: number, by: number) {
    // Only groups that were reordered end up in the list; the others keep sorting by name
    const ids = groups.find(([k]) => k === key)![1].map(e => e.entity_id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id!)
    const others = (this.room.order ?? []).filter(x => !ids.includes(x))
    this.setRoom({ order: [...others, ...ids] })
  }

  private toggleIn<T>(list: T[] | undefined, item: T) {
    const current = list ?? []
    return current.includes(item) ? current.filter(x => x !== item) : [...current, item]
  }

  private iconBtn(icon: string, label: string, onClick: () => void, disabled = false) {
    return html`<button class="icon-btn" aria-label=${label} title=${label} ?disabled=${disabled} @click=${onClick}>
      <ha-icon icon=${icon}></ha-icon></button>`
  }

  private renderGroups() {
    const groups = this.groups()
    const keys = groups.map(([key]) => key)
    const hiddenGroups = this.room.hide_groups ?? []
    const hiddenEntities = this.config.hide_entities ?? []
    const areaName = this.hass!.areas[this.area]?.name
    if (!groups.length) return html`<span class="hint">${this.l('ed.room_empty')}</span>`
    return html`<div class="groups">${groups.map(([key, entities], gi) => {
      const groupOff = hiddenGroups.includes(key)
      return html`<div class="group">
        <div class="row head ${groupOff ? 'off' : ''}">
          <span class="name">${t(this.hass, `group.${key}` as Key)}</span>
          ${this.iconBtn('mdi:arrow-up', '↑', () => this.moveGroup(keys, gi, -1), gi === 0)}
          ${this.iconBtn('mdi:arrow-down', '↓', () => this.moveGroup(keys, gi, 1), gi === groups.length - 1)}
          ${this.iconBtn(groupOff ? 'mdi:eye-off-outline' : 'mdi:eye-outline', this.l(groupOff ? 'ed.show' : 'ed.hide'),
            () => this.setRoom({ hide_groups: this.toggleIn(this.room.hide_groups, key) }))}
        </div>
        ${groupOff ? nothing : entities.map((e, i) => {
          const off = hiddenEntities.includes(e.entity_id)
          return html`<div class="row ${off ? 'off' : ''}">
            <span class="name" title=${e.entity_id}>${shortName(entityName(e), areaName)}</span>
            ${this.iconBtn('mdi:arrow-up', '↑', () => this.moveEntity(groups, key, i, -1), i === 0)}
            ${this.iconBtn('mdi:arrow-down', '↓', () => this.moveEntity(groups, key, i, 1), i === entities.length - 1)}
            ${this.iconBtn(off ? 'mdi:eye-off-outline' : 'mdi:eye-outline', this.l(off ? 'ed.show' : 'ed.hide'),
              () => this.emit({ hide_entities: this.toggleIn(this.config.hide_entities, e.entity_id) }))}
          </div>`
        })}
      </div>`
    })}</div>`
  }

  private setCards(value: unknown) {
    const list = value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value]
    this.yamlError = !list.every(c => c && typeof c === 'object' && typeof (c as { type?: unknown }).type === 'string')
    if (this.yamlError) return
    this.setRoom({ cards: { ...(this.room.cards ?? {}), [this.slot]: list as Record<string, unknown>[] } })
  }

  private renderCards() {
    const groups = this.groups().map(([key]) => key)
    const slots: CardSlot[] = ['top', ...groups, 'bottom']
    const value = this.room.cards?.[this.slot] ?? []
    const slotLabel = (s: CardSlot) => s === 'top' || s === 'bottom' ? this.l(`ed.slot_${s}`) : `${this.l('ed.slot_in')} ${t(this.hass, `group.${s}` as Key)}`
    return html`
      <span class="label">${this.l('ed.own_cards')}</span>
      <select .value=${this.slot} @change=${(e: Event) => { this.slot = (e.target as HTMLSelectElement).value as CardSlot; this.yamlError = false }}>
        ${slots.map(s => html`<option value=${s} ?selected=${s === this.slot}>${slotLabel(s)}${this.room.cards?.[s]?.length ? ` (${this.room.cards[s]!.length})` : ''}</option>`)}
      </select>
      ${customElements.get('ha-selector')
        // HA's object selector is its YAML editor. Keyed by room and slot, so switching loads that slot's cards
        ? keyed(`${this.area}/${this.slot}`, html`<ha-selector .hass=${this.hass} .selector=${{ object: {} }} .value=${value}
            @value-changed=${(e: CustomEvent) => this.setCards(e.detail.value)}></ha-selector>`)
        : html`<textarea .value=${value.length ? JSON.stringify(value, null, 2) : ''} placeholder='[{"type": "markdown", "content": "…"}]'
            @change=${(e: Event) => {
              const text = (e.target as HTMLTextAreaElement).value.trim()
              try { this.setCards(text ? JSON.parse(text) : []) } catch { this.yamlError = true }
            }}></textarea>`}
      <span class="hint ${this.yamlError ? 'error' : ''}">${this.l(this.yamlError ? 'ed.cards_error' : 'ed.cards_hint')}</span>`
  }

  protected willUpdate() {
    if (this.hass && (!this.area || !this.hass.areas[this.area])) this.area = this.areas[0]?.area_id ?? ''
  }

  /** Back to the automatic room page, its hidden entities included. */
  private resetRoom() {
    const rooms = { ...(this.config.rooms ?? {}) }
    delete rooms[this.area]
    const ids = new Set((this.hass ? areaEntities(this.hass, this.area) : []).map(e => e.entity_id))
    this.emit({ rooms, hide_entities: (this.config.hide_entities ?? []).filter(id => !ids.has(id)) })
  }

  protected render() {
    if (!this.hass || !this.area) return nothing
    const areas = this.areas
    const customized = !!this.config.rooms?.[this.area] || (this.config.hide_entities ?? []).some(id => this.groups().some(([, list]) => list.some(e => e.entity_id === id)))
    return html`
      <select .value=${this.area} aria-label=${this.l('ed.room')}
        @change=${(e: Event) => { this.area = (e.target as HTMLSelectElement).value; this.slot = 'top'; this.yamlError = false }}>
        ${areas.map(a => html`<option value=${a.area_id} ?selected=${a.area_id === this.area}>${a.name}${this.config.rooms?.[a.area_id] ? ' •' : ''}</option>`)}
      </select>
      <span class="hint">${this.l('ed.room_hint')}</span>
      ${this.renderGroups()}
      ${this.renderCards()}
      ${customized ? html`<button class="link" @click=${() => this.resetRoom()}>${this.l('ed.room_reset')}</button>` : nothing}`
  }
}
