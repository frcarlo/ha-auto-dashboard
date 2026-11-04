// Config editor HA shows for this strategy in edit mode (pencil → "Edit dashboard").
// Only admins can edit dashboards, so only admins reach it. Uses HA's theme variables to fit the dialog.
import { LitElement, css, html, nothing, type TemplateResult } from 'lit'
import { cleanConfig, normalizeConfig } from './config'
import { HIDE_LABEL } from './model'
import { isHexColor } from './styles/palette'
import type { RoomsPatch } from './editor-rooms'
import { t, type Key } from './i18n'
import type { AreaRegistryEntry, HomeAssistant, NavPosition, PagePath, StrategyConfig, ThemeMode, UserRule } from './types'

interface HaUser {
  id: string
  name: string
  system_generated: boolean
  is_active?: boolean
  group_ids?: string[]
}

interface HaLabel {
  label_id: string
  name: string
}

interface Option {
  id: string
  label: string
}

/** Accent suggestions; the color picker covers everything else. Indigo is the default. */
const SWATCHES = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f43f5e', '#a855f7', '#64748b']

const PAGES: PagePath[] = ['lights', 'climate', 'covers', 'security', 'cameras', 'energy', 'maintenance']
const DOMAINS = [
  'light', 'climate', 'cover', 'media_player', 'switch', 'fan', 'input_boolean', 'vacuum',
  'lock', 'alarm_control_panel', 'scene', 'script', 'sensor', 'binary_sensor',
] as const

export class AdStrategyEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
    users: { state: true },
    labels: { state: true },
    openPickers: { state: true },
  }

  hass?: HomeAssistant
  config: StrategyConfig = { type: 'custom:auto-dashboard' }
  users: HaUser[] = []
  labels: HaLabel[] = []
  /** Room pickers currently showing their full list */
  openPickers = new Set<string>()
  private usersRequested = false

  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color, #e5e7eb);
      --ad-accent: var(--primary-color, #6366f1);
      --ad-line: var(--divider-color, rgba(127, 127, 127, 0.25));
    }
    details { border: 1px solid var(--ad-line); border-radius: 16px; margin-bottom: 12px; overflow: hidden; }
    summary {
      cursor: pointer; list-style: none; padding: 14px 16px; font-weight: 500; font-size: 15px;
      display: flex; align-items: center; justify-content: space-between;
    }
    summary::-webkit-details-marker { display: none; }
    summary::after { content: '▾'; opacity: 0.5; transition: transform 0.2s ease; }
    details[open] summary::after { transform: rotate(180deg); }
    .body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 8px; }
    /* Each option is its own block, so long chip lists don't run into the next heading */
    .body > .field + .field, .body > .field + .row, .body > .row + .field { border-top: 1px solid var(--ad-line); padding-top: 14px; }
    .label { font-size: 14px; font-weight: 600; color: var(--primary-text-color, inherit); }
    .picker-list { border: 1px solid var(--ad-line); border-radius: 12px; padding: 10px 12px; }
    /* .chip resets everything, so these need the higher specificity */
    .chip.picked { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px 4px 11px; }
    .picked .x { all: unset; cursor: pointer; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 14px; line-height: 1; }
    .picked .x:hover { background: color-mix(in srgb, var(--ad-accent) 25%, transparent); }
    .hint { font-size: 12px; color: var(--secondary-text-color, #94a3b8); line-height: 1.4; }
    input[type=text], select, textarea {
      font: inherit; color: inherit; background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
      border: 1px solid var(--ad-line); border-radius: 10px; padding: 9px 12px;
    }
    select option { color: #111; }
    textarea { min-height: 72px; resize: vertical; font-family: var(--code-font-family, monospace); font-size: 12px; }
    .seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--ad-line); border-radius: 10px; overflow: hidden; align-self: flex-start; }
    .seg button { all: unset; cursor: pointer; padding: 7px 14px; font-size: 13px; }
    .seg button + button { border-left: 1px solid var(--ad-line); }
    .seg button[aria-pressed=true] { background: color-mix(in srgb, var(--ad-accent) 18%, transparent); color: var(--ad-accent); font-weight: 500; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .colors { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .swatch {
      all: unset; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; box-sizing: border-box;
      border: 2px solid transparent; box-shadow: inset 0 0 0 2px var(--card-background-color, #fff);
    }
    .swatch[aria-pressed=true] { border-color: var(--primary-text-color, currentColor); }
    .swatch:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
    input[type=color] { width: 36px; height: 30px; padding: 0; border: 1px solid var(--ad-line); border-radius: 8px; background: none; cursor: pointer; }
    .chip {
      all: unset; cursor: pointer; padding: 5px 11px; border-radius: 999px; font-size: 13px;
      border: 1px solid var(--ad-line);
    }
    .chip[aria-pressed=true] {
      border-color: var(--ad-accent); color: var(--ad-accent);
      background: color-mix(in srgb, var(--ad-accent) 14%, transparent);
    }
    .group { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.55; width: 100%; margin-top: 6px; }
    .group:first-child { margin-top: 0; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; cursor: pointer; }
    .switch { all: unset; position: relative; flex: 0 0 auto; width: 36px; height: 20px; border-radius: 10px; background: var(--ad-line); transition: background 0.2s ease; }
    .switch::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); transition: transform 0.2s ease;
    }
    .switch[aria-checked=true] { background: var(--ad-accent); }
    .switch[aria-checked=true]::after { transform: translateX(16px); }
    .order { display: flex; flex-direction: column; gap: 2px; }
    .order div { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 2px 0; }
    .order span { flex: 1; }
    .icon-btn { all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; opacity: 0.7; }
    .icon-btn:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); opacity: 1; }
    .icon-btn[disabled] { opacity: 0.2; pointer-events: none; }
    .rule { border: 1px solid var(--ad-line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
    .rule-head { display: flex; align-items: center; justify-content: space-between; font-weight: 500; }
    .badge { font-size: 11px; font-weight: 400; opacity: 0.6; margin-left: 6px; }
    .link { all: unset; cursor: pointer; font-size: 12px; color: var(--ad-accent); }
    button:focus-visible, .switch:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
  `

  setConfig(config: StrategyConfig) {
    this.config = normalizeConfig(config)
  }

  connectedCallback() {
    super.connectedCallback()
    // HA loads its entity picker with the first card editor; asking for the tile card's editor pulls it in
    if (!customElements.get('ha-selector')) {
      customElements.whenDefined('ha-selector').then(() => this.requestUpdate())
      const helpers = (window as unknown as { loadCardHelpers?: () => Promise<{ createCardElement(c: object): HTMLElement }> }).loadCardHelpers
      helpers?.().then(h => {
        h.createCardElement({ type: 'tile', entity: 'sun.sun' })
        return customElements.whenDefined('hui-tile-card')
      }).then(() => (customElements.get('hui-tile-card') as unknown as { getConfigElement?: () => Promise<unknown> } | undefined)?.getConfigElement?.())
        .catch(() => undefined)
    }
  }

  protected updated() {
    // The user list is admin-only; this editor only opens for admins
    if (this.hass?.callWS && !this.usersRequested) {
      this.usersRequested = true
      this.hass.callWS<HaUser[]>({ type: 'config/auth/list' })
        .then(users => { this.users = users.filter(u => !u.system_generated && u.is_active !== false) })
        .catch(() => { this.users = [] })
      // hass carries label ids on entities, devices and areas, but not the label names
      this.hass.callWS<HaLabel[]>({ type: 'config/label_registry/list' })
        .then(labels => { this.labels = labels.filter(l => l.label_id !== HIDE_LABEL) })
        .catch(() => { this.labels = [] })
    }
  }

  private l(key: Key) {
    return t(this.hass, key)
  }

  private change(patch: Partial<StrategyConfig>) {
    this.config = { ...this.config, ...patch }
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cleanConfig(this.config) }, bubbles: true, composed: true }))
  }

  private changeRule(key: string, patch: Partial<UserRule> | null) {
    const users = { ...(this.config.users ?? {}) }
    if (patch === null) delete users[key]
    else users[key] = { ...(users[key] ?? {}), ...patch }
    this.change({ users })
  }

  // Building blocks

  private seg<T extends string>(options: [T, Key][], value: T, onPick: (v: T) => void) {
    return html`<div class="seg" role="group">${options.map(([v, label]) => html`
      <button aria-pressed=${value === v} @click=${() => onPick(v)}>${this.l(label)}</button>`)}</div>`
  }

  private toggle(label: string, checked: boolean, onToggle: (v: boolean) => void) {
    return html`<label class="row" @click=${(e: Event) => { e.preventDefault(); onToggle(!checked) }}>
      <span>${label}</span>
      <button class="switch" role="switch" aria-checked=${checked} aria-label=${label}></button>
    </label>`
  }

  private chips(options: Option[], selected: string[] | undefined, onChange: (v: string[]) => void, groups?: Map<string, Option[]>) {
    const sel = selected ?? []
    const chip = (o: Option) => html`<button class="chip" aria-pressed=${sel.includes(o.id)}
      @click=${() => onChange(sel.includes(o.id) ? sel.filter(x => x !== o.id) : [...sel, o.id])}>${o.label}</button>`
    if (!groups) return html`<div class="chips">${options.map(chip)}</div>`
    return html`<div class="chips">${[...groups].map(([name, items]) => html`
      <span class="group">${name}</span>${items.map(chip)}`)}</div>`
  }

  /**
   * Room selection: the chosen rooms as removable chips, the full list by floor only when opened.
   * Three long lists of every room in a row were too easy to mix up.
   */
  private areaPicker(key: string, selected: string[] | undefined, onChange: (v: string[]) => void) {
    const sel = selected ?? []
    const open = this.openPickers.has(key)
    const toggleOpen = () => {
      const next = new Set(this.openPickers)
      if (open) next.delete(key)
      else next.add(key)
      this.openPickers = next
    }
    const name = (id: string) => this.hass?.areas[id]?.name ?? id
    return html`<div class="chips">
        ${sel.length ? sel.map(id => html`<span class="chip picked" aria-pressed="true">${name(id)}
          <button class="x" aria-label="${this.l('ed.remove')}: ${name(id)}" title=${this.l('ed.remove')}
            @click=${() => onChange(sel.filter(x => x !== id))}>×</button></span>`)
          : html`<span class="hint">${this.l('ed.none_selected')}</span>`}
        <button class="chip" aria-expanded=${open} @click=${toggleOpen}>${open ? this.l('ed.done') : `${this.l('ed.pick_areas')} ▾`}</button>
      </div>
      ${open ? html`<div class="picker-list">${this.chips([], sel, onChange, this.areasByFloor)}</div>` : nothing}`
  }

  private colorPicker(value: string | undefined) {
    const current = isHexColor(value) ? value.toLowerCase() : undefined
    const set = (primary_color?: string) => this.change({ primary_color })
    return html`<div class="colors">
      ${SWATCHES.map(color => html`<button class="swatch" style="background:${color}" aria-label=${color} title=${color}
        aria-pressed=${(current ?? SWATCHES[0]) === color} @click=${() => set(color === SWATCHES[0] ? undefined : color)}></button>`)}
      <input type="color" .value=${current ?? SWATCHES[0]!} aria-label=${this.l('ed.primary')}
        @change=${(e: Event) => set((e.target as HTMLInputElement).value)}>
      ${current ? html`<button class="link" @click=${() => set(undefined)}>${this.l('ed.reset')}</button>` : nothing}
    </div>`
  }

  /** HA's own entity picker when it is loaded, else one entity id per line. */
  private entityPicker(value: string[] | undefined, domains: string[] | undefined, onChange: (v: string[]) => void) {
    if (customElements.get('ha-selector')) {
      return html`<ha-selector .hass=${this.hass} .value=${value ?? []}
        .selector=${{ entity: { multiple: true, ...(domains ? { filter: { domain: domains } } : {}) } }}
        @value-changed=${(e: CustomEvent) => onChange((e.detail.value as string[] | undefined) ?? [])}></ha-selector>`
    }
    return html`<textarea .value=${(value ?? []).join('\n')} placeholder=${this.l('ed.ids_hint')}
      @change=${(e: Event) => onChange((e.target as HTMLTextAreaElement).value.split(/[\s,]+/).filter(Boolean))}></textarea>`
  }

  private field(label: string, content: TemplateResult, hint?: string) {
    return html`<div class="field"><span class="label">${label}</span>${content}${hint ? html`<span class="hint">${hint}</span>` : nothing}</div>`
  }

  // Data from HA

  /** Known labels, plus selected ones that were deleted in HA meanwhile, so they can be removed. */
  private get labelOptions(): Option[] {
    const known = this.labels.map(l => ({ id: l.label_id, label: l.name })).sort((a, b) => a.label.localeCompare(b.label))
    const gone = (this.config.hide_labels ?? []).filter(id => !this.labels.some(l => l.label_id === id)).map(id => ({ id, label: id }))
    return [...known, ...gone]
  }

  private get floorOptions(): Option[] {
    return Object.values(this.hass?.floors ?? {})
      .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity) || a.name.localeCompare(b.name))
      .map(f => ({ id: f.floor_id, label: f.name }))
  }

  private get areasByFloor(): Map<string, Option[]> {
    const groups = new Map<string, Option[]>()
    const floors = this.hass?.floors ?? {}
    const areas = Object.values(this.hass?.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name))
    for (const floor of this.floorOptions) {
      const items = areas.filter(a => a.floor_id === floor.id).map(a => ({ id: a.area_id, label: a.name }))
      if (items.length) groups.set(floor.label, items)
    }
    const rest = areas.filter(a => !a.floor_id || !floors[a.floor_id]).map(a => ({ id: a.area_id, label: a.name }))
    if (rest.length) groups.set(this.l('other_rooms'), rest)
    return groups
  }

  private get orderedAreas(): AreaRegistryEntry[] {
    const order = this.config.area_order ?? []
    const rank = (id: string) => (order.indexOf(id) + 1 || order.length + 1)
    return Object.values(this.hass?.areas ?? {}).sort((a, b) => rank(a.area_id) - rank(b.area_id) || a.name.localeCompare(b.name))
  }

  private userLabel(key: string) {
    if (key === 'default') return html`${this.l('ed.default_user')}`
    const user = this.users.find(u => u.id === key)
    const admin = user?.group_ids?.includes('system-admin')
    return html`${user?.name ?? key}${admin ? html`<span class="badge">${this.l('ed.admin')}</span>` : nothing}`
  }

  // Sections

  protected render() {
    if (!this.hass) return nothing
    return html`${this.renderLook()}${this.renderHome()}${this.renderRooms()}${this.renderRoomPages()}${this.renderUsers()}`
  }

  private renderRoomPages() {
    return html`<details ?open=${!!this.config.rooms}>
      <summary>${this.l('ed.room_pages')}</summary>
      <div class="body">
        <ad-room-settings .hass=${this.hass} .config=${this.config}
          @rooms-changed=${(e: CustomEvent<RoomsPatch>) => this.change(e.detail)}></ad-room-settings>
      </div>
    </details>`
  }

  private renderHome() {
    const c = this.config
    return html`<details ?open=${!!(c.favorites?.length || c.scenes?.length)}>
      <summary>${this.l('ed.home')}</summary>
      <div class="body">
        ${this.field(this.l('favorites'), this.entityPicker(c.favorites, undefined, favorites => this.change({ favorites })), this.l('ed.favorites_hint'))}
        ${this.field(this.l('scenes'), this.entityPicker(c.scenes, ['scene', 'script'], scenes => this.change({ scenes })), this.l('ed.scenes_hint'))}
      </div>
    </details>`
  }

  private renderLook() {
    const c = this.config
    return html`<details open>
      <summary>${this.l('ed.look')}</summary>
      <div class="body">
        ${this.field(this.l('ed.title'), html`<input type="text" .value=${c.title ?? ''} placeholder=${this.l('home')}
          @change=${(e: Event) => this.change({ title: (e.target as HTMLInputElement).value.trim() || undefined })}>`)}
        ${this.field(this.l('ed.theme'), this.seg<ThemeMode>(
          [['auto', 'ed.theme_auto'], ['dark', 'ed.theme_dark'], ['light', 'ed.theme_light']],
          c.theme ?? 'auto', theme => this.change({ theme })))}
        ${this.field(this.l('ed.primary'), this.colorPicker(c.primary_color), this.l('ed.primary_hint'))}
        ${isHexColor(c.primary_color) ? this.toggle(this.l('ed.ha_colors'), c.ha_colors !== false, ha_colors => this.change({ ha_colors })) : nothing}
        ${this.toggle(this.l('ed.glass'), !!c.glass, glass => this.change({ glass }))}
        ${this.field(this.l('ed.nav'), this.seg<NavPosition>(
          [['bottom', 'ed.nav_bottom'], ['top', 'ed.nav_top'], ['left', 'ed.nav_left'], ['right', 'ed.nav_right']],
          c.nav_position ?? 'bottom', nav_position => this.change({ nav_position })))}
      </div>
    </details>`
  }

  private renderRooms() {
    const c = this.config
    const ordered = this.orderedAreas
    const move = (index: number, by: number) => {
      const ids = ordered.map(a => a.area_id)
      const [id] = ids.splice(index, 1)
      ids.splice(index + by, 0, id!)
      this.change({ area_order: ids })
    }
    return html`<details>
      <summary>${this.l('ed.rooms')}</summary>
      <div class="body">
        ${this.field(this.l('ed.only_floors'), this.chips(this.floorOptions, c.floors, floors => this.change({ floors })), this.l('ed.none_hint'))}
        ${this.field(this.l('ed.only_areas'), this.areaPicker('areas', c.areas, areas => this.change({ areas })), this.l('ed.none_hint'))}
        ${this.field(this.l('ed.hide_areas'), this.areaPicker('hide_areas', c.hide_areas, hide_areas => this.change({ hide_areas })))}
        ${this.field(this.l('ed.outdoor'), this.areaPicker('outdoor', c.outdoor_areas, outdoor_areas => this.change({ outdoor_areas })), this.l('ed.outdoor_hint'))}
        ${this.field(this.l('ed.hide_domains'), this.chips(
          DOMAINS.map(d => ({ id: d, label: this.l(`dom.${d}`) })), c.hide_domains, hide_domains => this.change({ hide_domains })))}
        ${this.labelOptions.length ? this.field(this.l('ed.hide_labels'), this.chips(
          this.labelOptions, c.hide_labels, hide_labels => this.change({ hide_labels })), this.l('ed.hide_labels_hint')) : nothing}
        ${this.field(this.l('ed.order'), html`<div class="order">
          ${ordered.map((area, i) => html`<div>
            <span>${area.name}</span>
            <button class="icon-btn" aria-label="↑" ?disabled=${i === 0} @click=${() => move(i, -1)}>↑</button>
            <button class="icon-btn" aria-label="↓" ?disabled=${i === ordered.length - 1} @click=${() => move(i, 1)}>↓</button>
          </div>`)}
          ${c.area_order?.length ? html`<button class="link" @click=${() => this.change({ area_order: undefined })}>${this.l('ed.reset')}</button>` : nothing}
        </div>`)}
      </div>
    </details>`
  }

  private renderUsers() {
    const rules = Object.entries(this.config.users ?? {})
    const free = [
      ...this.users.filter(u => !this.config.users?.[u.id]).map(u => ({ id: u.id, label: u.name })),
      ...(this.config.users?.default ? [] : [{ id: 'default', label: this.l('ed.default_user') }]),
    ]
    return html`<details ?open=${rules.length > 0}>
      <summary>${this.l('ed.users')}</summary>
      <div class="body">
        <span class="hint">${this.l('ed.users_hint')}</span>
        ${rules.map(([key, rule]) => this.renderRule(key, rule))}
        ${free.length ? html`<select @change=${(e: Event) => {
          const select = e.target as HTMLSelectElement
          if (select.value) this.changeRule(select.value, {})
          select.value = ''
        }}>
          <option value="">${this.l('ed.add_user')}</option>
          ${free.map(o => html`<option value=${o.id}>${o.label}</option>`)}
        </select>` : nothing}
      </div>
    </details>`
  }

  private renderRule(key: string, rule: UserRule) {
    return html`<div class="rule">
      <div class="rule-head">
        <span>${this.userLabel(key)}</span>
        <button class="link" @click=${() => this.changeRule(key, null)}>${this.l('ed.remove')}</button>
      </div>
      ${this.toggle(this.l('ed.read_only'), !!rule.read_only, read_only => this.changeRule(key, { read_only }))}
      ${rule.read_only ? nothing : this.toggle(this.l('ed.critical'), rule.control_critical !== false,
        on => this.changeRule(key, { control_critical: on }))}
      ${this.field(this.l('ed.hide_pages'), this.chips(
        PAGES.map(p => ({ id: p, label: this.l(p) })),
        rule.hide_pages, hide_pages => this.changeRule(key, { hide_pages: hide_pages as PagePath[] })))}
      ${this.field(this.l('ed.only_floors'), this.chips(this.floorOptions, rule.floors, floors => this.changeRule(key, { floors })), this.l('ed.none_hint'))}
      ${this.field(this.l('ed.only_areas'), this.areaPicker(`rule:${key}`, rule.areas, areas => this.changeRule(key, { areas })), this.l('ed.none_hint'))}
    </div>`
  }
}
