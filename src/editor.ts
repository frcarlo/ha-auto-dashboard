// Config editor HA shows for this strategy in edit mode (pencil → "Edit dashboard").
// Only admins can edit dashboards, so only admins reach it. Uses HA's theme variables to fit the dialog.
import { LitElement, css, html, nothing, type TemplateResult } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { cleanConfig, normalizeConfig } from './config'
import { findSchools } from './school'
import { CO2_LIMIT, co2Sensors } from './events'
import { HIDE_LABEL, hideOf, isRoomFavorite, replaceFavorites } from './model'
import { findAppliances } from './appliances'
import { CLOSE_AFTER, actionsFor, cameraFor, findDoorbells } from './popups'
import { entityName } from './presentation'
import { DEFAULT_TV_APPS, TV_APPS } from './tv-apps'
import { isHexColor } from './styles/palette'
import { WEATHER_SENSORS } from './weather'
import type { RoomsPatch } from './editor-rooms'
import { house, houseStyles, type RoomMark } from './editor-house'
import { t, type Key } from './i18n'
import { accessOf } from './access'
import type { Access, ApplianceConfig, PopupRule, AreaRegistryEntry, FaceConfig, FaceStyle, HomeAssistant, NavPosition, OwnCardsPage, PagePath, StatusChip, StrategyConfig, ThemeMode, UserRule } from './types'
import { scrollRow } from './scroll-row'

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

type Tab = 'look' | 'home' | 'house' | 'rooms' | 'users'
const TABS: [Tab, Key][] = [['look', 'ed.look'], ['home', 'ed.home'], ['house', 'ed.house'], ['rooms', 'ed.room_pages'], ['users', 'ed.users']]

/** Room roles set in the house drawing, and the config list each one writes */
type Tool = 'hide' | 'outdoor' | 'only'
const TOOL_KEYS: Record<Tool, 'hide_areas' | 'outdoor_areas' | 'areas'> = { hide: 'hide_areas', outdoor: 'outdoor_areas', only: 'areas' }
const TOOL_MARKS: Record<Tool, RoomMark> = { hide: 'hidden', outdoor: 'outdoor', only: 'only' }

const PAGES: PagePath[] = ['lights', 'climate', 'covers', 'security', 'cameras', 'music', 'calendar', 'lists', 'energy', 'maintenance']
const CHIPS: StatusChip[] = ['lights', 'openings', 'unlocked', 'heating', 'media', 'battery', 'unavailable', 'presence', 'school',
  'warning', 'waste', 'birthday', 'parcel', 'appliance', 'co2']
const EVENT_CHIPS: StatusChip[] = ['school', 'warning', 'waste', 'birthday', 'parcel', 'appliance', 'co2']
const CO2_LIMITS = [1000, 1200, 1500, 2000]
const DOMAINS = [
  'light', 'climate', 'cover', 'media_player', 'switch', 'fan', 'input_boolean', 'vacuum',
  'lock', 'alarm_control_panel', 'scene', 'script', 'button', 'sensor', 'binary_sensor', 'camera', 'todo', 'weather',
] as const

export class AdStrategyEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
    users: { state: true },
    labels: { state: true },
    tab: { state: true },
    tool: { state: true },
    roomArea: { state: true },
    cardsPage: { state: true },
    cardsSlot: { state: true },
    cardsError: { state: true },
  }

  hass?: HomeAssistant
  config: StrategyConfig = { type: 'custom:auto-dashboard' }
  users: HaUser[] = []
  labels: HaLabel[] = []
  tab: Tab = 'look'
  /** What a tap on a room does in the house tab */
  tool: Tool = 'hide'
  /** Room being edited on the room pages tab */
  roomArea = ''
  /** Page and place whose own cards are being edited */
  cardsPage: OwnCardsPage = 'home'
  cardsSlot: 'top' | 'bottom' = 'top'
  cardsError = false
  private usersRequested = false

  static styles = [houseStyles, css`
    :host {
      display: block;
      color: var(--primary-text-color, #e5e7eb);
      --ad-accent: var(--primary-color, #6366f1);
      --ad-line: var(--divider-color, rgba(127, 127, 127, 0.25));
    }
    .body { display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 8px; }
    /* Each option is its own block, so long chip lists don't run into the next heading */
    .body > .field + .field, .body > .field + .row, .body > .row + .field { border-top: 1px solid var(--ad-line); padding-top: 14px; }
    .label { font-size: 14px; font-weight: 600; color: var(--primary-text-color, inherit); }
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
    .tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--ad-line); margin-bottom: 18px; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      all: unset; cursor: pointer; padding: 10px 12px; margin-bottom: -1px; font-size: 14px; font-weight: 500; white-space: nowrap;
      color: var(--secondary-text-color, #94a3b8); border-bottom: 2px solid transparent;
    }
    .tab:hover { color: var(--primary-text-color, inherit); }
    .tab[aria-selected=true] { color: var(--ad-accent); border-bottom-color: var(--ad-accent); }
    .tab:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: -2px; }
    .tool-hint { min-height: 2.8em; }
    .summary { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-size: 13px; }
    .summary > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .summary b { font-weight: 600; }
    .appliance { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px 12px; font-size: 13px; padding: 12px 0; border-bottom: 1px solid var(--ad-line); }
    .appliance .link { grid-column: 2; justify-self: end; }
    .sensors { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px 12px; font-size: 13px; }
  `]

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

  private l(key: Key, vars: Record<string, string | number> = {}) {
    return t(this.hass, key, vars)
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

  /** Face style and wait: off or a style, then how long without a touch */
  private faceFields(face: FaceConfig | false | undefined, onChange: (face: FaceConfig | false | undefined) => void, inherit: boolean) {
    const styles: [FaceStyle, Key][] = [['clock', 'face.clock'], ['analog', 'face.analog'], ['photo', 'face.photo'], ['calendar', 'face.calendar']]
    const value = face === false ? 'off' : face ? face.style ?? 'clock' : inherit ? 'inherit' : 'off'
    const options: [string, Key][] = [...(inherit ? [['inherit', 'ed.face_inherit'] as [string, Key]] : []), ['off', 'ed.face_off'], ...styles]
    const minutes = new Intl.NumberFormat(this.hass?.language, { style: 'unit', unit: 'minute', unitDisplay: 'short' })
    const seconds = new Intl.NumberFormat(this.hass?.language, { style: 'unit', unit: 'second', unitDisplay: 'short' })
    const waits = [0, 30, 60, 120, 300, 600]
    const after = face ? face.after ?? 120 : 120
    return html`${this.seg(options, value, v => onChange(
      v === 'inherit' ? undefined : v === 'off' ? (inherit ? false : undefined) : { ...(face || {}), style: v as FaceStyle }))}
      ${face ? html`<div class="seg" role="group" aria-label=${this.l('ed.face_after')}>${waits.map(w => html`
        <button aria-pressed=${after === w} @click=${() => onChange({ ...face, after: w === 120 ? undefined : w })}>
          ${w === 0 ? this.l('ed.face_now') : w < 60 ? seconds.format(w) : minutes.format(w / 60)}</button>`)}</div>` : nothing}`
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

  /** One entity, HA's picker when it is loaded, else its id. */
  private singleEntityPicker(value: string | undefined, domain: string | string[], onChange: (v: string | undefined) => void, deviceClasses?: string[]) {
    if (customElements.get('ha-selector')) {
      const filter = deviceClasses ? deviceClasses.map(device_class => ({ domain, device_class })) : { domain }
      return html`<ha-selector .hass=${this.hass} .value=${value}
        .selector=${{ entity: { filter } }}
        @value-changed=${(e: CustomEvent) => onChange((e.detail.value as string | undefined) || undefined)}></ha-selector>`
    }
    return html`<input type="text" .value=${value ?? ''} placeholder="${[domain].flat()[0]}.…"
      @change=${(e: Event) => onChange((e.target as HTMLInputElement).value.trim() || undefined)}>`
  }

  /** Several areas, HA's picker when it is loaded, else one area id per line. */
  private areasPicker(value: string[] | undefined, onChange: (v: string[]) => void) {
    if (customElements.get('ha-selector')) {
      return html`<ha-selector .hass=${this.hass} .value=${value ?? []} .selector=${{ area: { multiple: true } }}
        @value-changed=${(e: CustomEvent) => onChange((e.detail.value as string[] | undefined) ?? [])}></ha-selector>`
    }
    return html`<textarea .value=${(value ?? []).join('\n')} placeholder="area_id"
      @change=${(e: Event) => onChange((e.target as HTMLTextAreaElement).value.split(/[\s,]+/).filter(Boolean))}></textarea>`
  }

  /** One area, HA's picker when it is loaded, else its id. */
  private areaPicker(value: string | undefined, onChange: (v: string | undefined) => void) {
    if (customElements.get('ha-selector')) {
      return html`<ha-selector .hass=${this.hass} .value=${value} .selector=${{ area: {} }}
        @value-changed=${(e: CustomEvent) => onChange((e.detail.value as string | undefined) || undefined)}></ha-selector>`
    }
    return html`<input type="text" .value=${value ?? ''} placeholder="area_id"
      @change=${(e: Event) => onChange((e.target as HTMLInputElement).value.trim() || undefined)}>`
  }

  /**
   * Appliances found from their devices are listed by name; ones without an operation state of their own
   * (a dryer on a smart plug) are added here with a state, power or on/off entity and, if there is one, its progress.
   */
  private renderAppliances() {
    const c = this.config
    const found = findAppliances(this.hass!, [], hideOf(c)).filter(a => !c.appliances?.some(own => own.status === a.status)).map(a => a.name)
    const list = c.appliances ?? []
    const set = (next: ApplianceConfig[]) => this.change({ appliances: next.length ? next : undefined })
    const update = (i: number, patch: Partial<ApplianceConfig>) => set(list.map((a, j) => j !== i ? a
      : Object.fromEntries(Object.entries({ ...a, ...patch }).filter(([, v]) => v !== undefined && v !== '')) as unknown as ApplianceConfig))
    return this.field(this.l('appliances'), html`
      ${list.map((a, i) => html`<div class="appliance">
        <span>${this.l('ed.appliance_name')}</span>
        <input type="text" .value=${a.name ?? ''} @change=${(e: Event) => update(i, { name: (e.target as HTMLInputElement).value.trim() || undefined })}>
        <span>${this.l('ed.appliance_status')}</span>
        ${this.singleEntityPicker(a.status || undefined, ['sensor', 'binary_sensor', 'switch'], status => update(i, { status: status ?? '' }))}
        <span>${this.l('ed.appliance_area')}</span>
        ${this.areaPicker(a.area, area => update(i, { area }))}
        <span>${this.l('ed.appliance_progress')}</span>
        ${this.singleEntityPicker(a.progress, 'sensor', progress => update(i, { progress }))}
        <span>${this.l('ed.appliance_remaining')}</span>
        ${this.singleEntityPicker(a.remaining, 'sensor', remaining => update(i, { remaining }))}
        <button class="link" @click=${() => set(list.filter((_, j) => j !== i))}>${this.l('ed.remove')}</button>
      </div>`)}
      <button class="link" @click=${() => set([...list, { status: '' }])}>${this.l('ed.appliance_add')}</button>`,
    found.length ? this.l('ed.appliances_found', { names: found.join(', ') }) : this.l('ed.appliances_none'))
  }

  /**
   * Popups: when a trigger fires, a window with the camera and the door's buttons. Doorbells found in the house are
   * offered as ready rules; camera and buttons stay empty until picked and are found on their own meanwhile.
   */
  private renderPopups() {
    const c = this.config
    const list = c.popups ?? []
    const set = (next: PopupRule[]) => this.change({ popups: next.length ? next : undefined })
    const update = (i: number, patch: Partial<PopupRule>) => set(list.map((rule, j) => j !== i ? rule
      : Object.fromEntries(Object.entries({ ...rule, ...patch }).filter(([k, v]) => k === 'trigger' || (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)))) as unknown as PopupRule))
    const doorbells = findDoorbells(this.hass!).filter(id => !list.some(rule => rule.trigger === id))
    const name = (id: string) => {
      const device = this.hass!.devices[this.hass!.entities[id]?.device_id ?? '']
      return device?.name_by_user ?? device?.name ?? entityName(this.hass!.states[id], id)
    }
    const auto = (rule: PopupRule) => {
      if (!rule.trigger || (rule.camera && rule.actions?.length)) return nothing
      const ids = [...(rule.camera ? [] : [cameraFor(this.hass!, rule.trigger)]), ...(rule.actions?.length ? [] : actionsFor(this.hass!, rule.trigger))]
        .filter((id): id is string => !!id)
      return html`<span class="hint">${ids.length ? this.l('ed.popup_auto', { ids: ids.join(', ') }) : this.l('ed.popup_auto_none')}</span>`
    }
    return this.field(this.l('ed.popups'), html`
      ${list.map((rule, i) => html`<div class="appliance">
        <span>${this.l('ed.popup_trigger')}</span>
        ${this.singleEntityPicker(rule.trigger || undefined, ['binary_sensor', 'event', 'input_boolean'], trigger => update(i, { trigger: trigger ?? '' }))}
        <span>${this.l('ed.popup_camera')}</span>
        ${this.singleEntityPicker(rule.camera, 'camera', camera => update(i, { camera }))}
        <span>${this.l('ed.popup_actions')}</span>
        ${this.entityPicker(rule.actions, ['lock', 'button', 'input_button', 'script', 'switch'], actions => update(i, { actions }))}
        <span></span>${auto(rule)}
        <span>${this.l('ed.popup_title')}</span>
        <input type="text" .value=${rule.title ?? ''} placeholder=${rule.trigger ? name(rule.trigger) : ''}
          @change=${(e: Event) => update(i, { title: (e.target as HTMLInputElement).value.trim() || undefined })}>
        <span>${this.l('ed.popup_close_after')}</span>
        <div class="seg" role="group">${[30, 60, 120, 300].map(n => html`
          <button aria-pressed=${(rule.close_after ?? CLOSE_AFTER) === n} @click=${() => update(i, { close_after: n === CLOSE_AFTER ? undefined : n })}>${n < 60 ? `${n} s` : `${n / 60} min`}</button>`)}</div>
        <button class="link" @click=${() => set(list.filter((_, j) => j !== i))}>${this.l('ed.remove')}</button>
      </div>`)}
      ${doorbells.map(id => html`<button class="link" @click=${() => set([...list, { trigger: id }])}>${this.l('ed.popup_doorbell', { name: name(id) })}</button>`)}
      <button class="link" @click=${() => set([...list, { trigger: '' }])}>${this.l('ed.popup_add')}</button>`,
    this.l('ed.popups_hint'))
  }

  /** HA's media picker with upload, like in its own view background editor, when it is loaded, else a path. */
  private imagePicker(value: string | undefined) {
    const set = (background_image?: string) => this.change({ background_image: background_image?.trim() || undefined })
    if (customElements.get('ha-selector')) {
      // The picker works with { media_content_id }; the config keeps just the id, a URL or media-source://…
      return html`<ha-selector .hass=${this.hass} .value=${value ? { media_content_id: value } : undefined}
        .selector=${{ media: { accept: ['image/*'], image_upload: true, hide_content_type: true } }}
        @value-changed=${(e: CustomEvent) => set((e.detail.value as { media_content_id?: string } | undefined)?.media_content_id)}></ha-selector>`
    }
    return html`<input type="text" .value=${value ?? ''} placeholder="/local/garten.jpg"
      @change=${(e: Event) => set((e.target as HTMLInputElement).value)}>`
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
    const panels: Record<Tab, () => TemplateResult> = {
      look: () => this.renderLook(), home: () => this.renderHome(), house: () => this.renderHouse(),
      rooms: () => this.renderRoomPages(), users: () => this.renderUsers(),
    }
    return html`<div class="tabs" ${scrollRow()} role="tablist" @keydown=${this.onTabKey}>
        ${TABS.map(([tab, label]) => html`<button class="tab" role="tab" id="tab-${tab}" aria-selected=${this.tab === tab}
          aria-controls="panel" tabindex=${this.tab === tab ? 0 : -1} @click=${() => (this.tab = tab)}>${this.l(label)}</button>`)}
      </div>
      <div class="body" role="tabpanel" id="panel" aria-labelledby="tab-${this.tab}">${panels[this.tab]()}</div>`
  }

  /** Arrow keys move between tabs, as in any tab list */
  private onTabKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!step) return
    const i = TABS.findIndex(([tab]) => tab === this.tab)
    this.tab = TABS[(i + step + TABS.length) % TABS.length]![0]
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(`#tab-${this.tab}`)?.focus())
  }

  private markLabel = (mark: RoomMark) => this.l(`ed.mark_${mark}` as Key)

  /** What the house tools have set, in words, each with a way to undo it at once */
  private houseSummary() {
    const c = this.config
    const hass = this.hass!
    const rows: [Key, 'areas' | 'floors' | 'hide_areas' | 'outdoor_areas', string[]][] = [
      ['ed.sum_only', 'areas', (c.areas ?? []).map(id => hass.areas[id]?.name ?? id)],
      ['ed.sum_floors', 'floors', (c.floors ?? []).map(id => hass.floors?.[id]?.name ?? id)],
      ['ed.sum_hidden', 'hide_areas', (c.hide_areas ?? []).map(id => hass.areas[id]?.name ?? id)],
      ['ed.sum_outdoor', 'outdoor_areas', (c.outdoor_areas ?? []).map(id => hass.areas[id]?.name ?? id)],
    ]
    const set = rows.filter(([, , names]) => names.length)
    if (!set.length) return html`<span class="hint">${this.l('ed.sum_none')}</span>`
    return html`<div class="summary">${set.map(([label, key, names]) => html`<div>
      <span><b>${this.l(label)}:</b> ${names.join(', ')}</span>
      <button class="link" @click=${() => this.change({ [key]: undefined })}>${this.l('ed.sum_clear')}</button>
    </div>`)}</div>`
  }

  private renderRoomPages() {
    const area = this.hass!.areas[this.roomArea] ? this.roomArea : Object.values(this.hass!.areas).sort((a, b) => a.name.localeCompare(b.name))[0]?.area_id ?? ''
    return html`
      <span class="hint">${this.l('ed.house_pick_hint')}</span>
      ${house({
        hass: this.hass!, outsideLabel: this.l('other_rooms'), markLabel: this.markLabel,
        marks: id => id === area ? ['picked'] : [],
        onRoom: id => (this.roomArea = id),
      })}
      ${area ? this.field(this.hass!.areas[area]!.name, html`<ad-room-settings .hass=${this.hass} .config=${this.config} .area=${area}
        @rooms-changed=${(e: CustomEvent<RoomsPatch>) => this.change(e.detail)}></ad-room-settings>`) : nothing}`
  }

  private renderHome() {
    const c = this.config
    return html`
        ${this.field(this.l('favorites'), this.entityPicker(c.favorites?.filter(id => !isRoomFavorite(id)), undefined,
          next => this.change({ favorites: replaceFavorites(c.favorites ?? [], false, next) })), this.l('ed.favorites_hint'))}
        ${this.field(this.l('ed.favorite_rooms'), this.areasPicker(c.favorites?.filter(isRoomFavorite),
          next => this.change({ favorites: replaceFavorites(c.favorites ?? [], true, next) })), this.l('ed.favorite_rooms_hint'))}
        ${this.field(this.l('scenes'), this.entityPicker(c.scenes, ['scene', 'script'], scenes => this.change({ scenes })), this.l('ed.scenes_hint'))}
        ${this.field(this.l('todos'), this.entityPicker(c.todo_lists, ['todo'], todo_lists => this.change({ todo_lists })), this.l('ed.todos_hint'))}
        ${this.field(this.l('ed.calendars'), this.entityPicker(c.calendars, ['calendar'], calendars => this.change({ calendars })), this.l('ed.calendars_hint'))}
        ${this.toggle(this.l('ed.calendar_edit'), c.calendar_edit !== false, calendar_edit => this.change({ calendar_edit: calendar_edit ? undefined : false }))}
        ${findSchools(this.hass!).length
          ? this.toggle(this.l('ed.school_home'), c.school_home !== false, on => this.change({ school_home: on ? undefined : false })) : nothing}
        ${this.field(this.l('ed.hide_chips'), this.chips(this.chipOptions,
          [...(c.hide_chips ?? []), ...(c.school_chips === false ? ['school' as const] : [])],
          hide_chips => this.change({ hide_chips: hide_chips as StatusChip[], school_chips: undefined })), this.l('ed.hide_chips_hint'))}
        ${co2Sensors(this.hass!, Object.keys(this.hass!.states)).length && !c.hide_chips?.includes('co2') ? this.field(this.l('ed.co2_limit'), html`<div class="seg" role="group">${CO2_LIMITS.map(n => html`
          <button aria-pressed=${(c.co2_limit ?? CO2_LIMIT) === n} @click=${() => this.change({ co2_limit: n === CO2_LIMIT ? undefined : n })}>${n}</button>`)}</div>`) : nothing}
        ${this.renderAppliances()}
        ${this.renderPopups()}
        ${this.renderPageCards()}
        ${this.field(this.l('ed.tv_apps'), this.chips(Object.entries(TV_APPS).map(([id, app]) => ({ id, label: app.name })),
          c.tv_apps ?? DEFAULT_TV_APPS, tv_apps => this.change({ tv_apps: tv_apps.length ? tv_apps : undefined })), this.l('ed.tv_apps_hint'))}
        ${c.hide_domains?.includes('weather') ? nothing : html`
          ${this.field(this.l('ed.weather'), this.singleEntityPicker(c.weather_entity, 'weather', weather_entity => this.change({ weather_entity })), this.l('ed.weather_hint'))}
          ${this.field(this.l('ed.sensors'), html`<div class="sensors">${WEATHER_SENSORS.map(([key, classes]) => html`
            <span>${this.l(`ws.${key}` as Key)}</span>
            ${this.singleEntityPicker(c.weather_sensors?.[key], 'sensor', id => {
              const next = { ...(c.weather_sensors ?? {}), [key]: id }
              if (!id) delete next[key]
              this.change({ weather_sensors: Object.keys(next).length ? next : undefined })
            }, classes)}`)}</div>`, this.l('ed.sensors_hint'))}
          ${this.field(this.l('ed.warnings'), this.entityPicker(c.weather_warnings, ['binary_sensor', 'sensor'], weather_warnings => this.change({ weather_warnings })), this.l('ed.warnings_hint'))}
          ${this.field(this.l('ed.forecast_days'), html`<div class="seg" role="group">${[0, 3, 5, 7].map(n => html`
            <button aria-pressed=${(c.forecast_days ?? 3) === n} @click=${() => this.change({ forecast_days: n })}>${n}</button>`)}</div>`)}`}`
  }

  /** Own Lovelace cards at the top or the bottom of Home and the other pages, like a room's own cards */
  private renderPageCards() {
    const pages: OwnCardsPage[] = ['home', ...PAGES]
    const page = this.config.pages?.[this.cardsPage]
    const value = page?.cards?.[this.cardsSlot] ?? []
    const count = (p: OwnCardsPage) => (this.config.pages?.[p]?.cards?.top?.length ?? 0) + (this.config.pages?.[p]?.cards?.bottom?.length ?? 0)
    const set = (raw: unknown) => {
      const list = raw === undefined || raw === null || raw === '' ? [] : Array.isArray(raw) ? raw : [raw]
      this.cardsError = !list.every(c => c && typeof c === 'object' && typeof (c as { type?: unknown }).type === 'string')
      if (this.cardsError) return
      const cards = { ...(page?.cards ?? {}), [this.cardsSlot]: list as Record<string, unknown>[] }
      this.change({ pages: { ...(this.config.pages ?? {}), [this.cardsPage]: { ...(page ?? {}), cards } } })
    }
    return this.field(this.l('ed.page_cards'), html`
      <select .value=${this.cardsPage} @change=${(e: Event) => { this.cardsPage = (e.target as HTMLSelectElement).value as OwnCardsPage; this.cardsError = false }}>
        ${pages.map(p => html`<option value=${p} ?selected=${p === this.cardsPage}>${this.l(p)}${count(p) ? ` (${count(p)})` : ''}</option>`)}
      </select>
      ${this.seg<'top' | 'bottom'>([['top', 'ed.page_top'], ['bottom', 'ed.page_bottom']], this.cardsSlot, slot => { this.cardsSlot = slot; this.cardsError = false })}
      ${customElements.get('ha-selector')
        // HA's object selector is its YAML editor; keyed so switching page or place loads those cards
        ? keyed(`${this.cardsPage}/${this.cardsSlot}`, html`<ha-selector .hass=${this.hass} .selector=${{ object: {} }} .value=${value}
            @value-changed=${(e: CustomEvent) => set(e.detail.value)}></ha-selector>`)
        : html`<textarea .value=${value.length ? JSON.stringify(value, null, 2) : ''} placeholder='[{"type": "markdown", "content": "…"}]'
            @change=${(e: Event) => {
              const text = (e.target as HTMLTextAreaElement).value.trim()
              try { set(text ? JSON.parse(text) : []) } catch { this.cardsError = true }
            }}></textarea>`}`,
      this.l(this.cardsError ? 'ed.cards_error' : 'ed.page_cards_hint'))
  }

  private renderLook() {
    const c = this.config
    return html`
        ${this.field(this.l('ed.title'), html`<input type="text" .value=${c.title ?? ''} placeholder=${this.l('home')}
          @change=${(e: Event) => this.change({ title: (e.target as HTMLInputElement).value.trim() || undefined })}>`)}
        ${this.field(this.l('ed.theme'), this.seg<ThemeMode>(
          [['auto', 'ed.theme_auto'], ['dark', 'ed.theme_dark'], ['light', 'ed.theme_light']],
          c.theme ?? 'auto', theme => this.change({ theme })))}
        ${this.field(this.l('ed.primary'), this.colorPicker(c.primary_color), this.l('ed.primary_hint'))}
        ${isHexColor(c.primary_color) ? this.toggle(this.l('ed.ha_colors'), c.ha_colors !== false, ha_colors => this.change({ ha_colors })) : nothing}
        ${this.toggle(this.l('ed.glass'), !!c.glass, glass => this.change({ glass }))}
        ${this.field(this.l('ed.background'), this.imagePicker(c.background_image), this.l('ed.background_hint'))}
        ${this.field(this.l('ed.nav'), this.seg<NavPosition>(
          [['bottom', 'ed.nav_bottom'], ['top', 'ed.nav_top'], ['left', 'ed.nav_left'], ['right', 'ed.nav_right']],
          c.nav_position ?? 'bottom', nav_position => this.change({ nav_position })))}
        ${this.toggle(this.l('ed.floor_tabs'), !!c.floor_tabs, floor_tabs => this.change({ floor_tabs }))}
        ${this.toggle(this.l('ed.page_floors'), c.page_floors !== false, on => this.change({ page_floors: on ? undefined : false }))}
        ${this.field(this.l('ed.face'), this.faceFields(c.face, face => this.change({ face: face || undefined }), false), this.l('ed.face_hint'))}`
  }

  private renderHouse() {
    const c = this.config
    const ordered = this.orderedAreas
    const move = (index: number, by: number) => {
      const ids = ordered.map(a => a.area_id)
      const [id] = ids.splice(index, 1)
      ids.splice(index + by, 0, id!)
      this.change({ area_order: ids })
    }
    const key = TOOL_KEYS[this.tool]
    const toggleIn = (list: string[] | undefined, id: string) => (list ?? []).includes(id) ? (list ?? []).filter(x => x !== id) : [...(list ?? []), id]
    const faded = (id: string) => !!(c.areas?.length && !c.areas.includes(id))
      || !!(c.floors?.length && !c.floors.includes(this.hass!.areas[id]?.floor_id ?? ''))
    const marks = (id: string): RoomMark[] => [
      ...(c.areas?.includes(id) ? ['only' as const] : []),
      ...(c.hide_areas?.includes(id) ? ['hidden' as const] : []),
      ...(c.outdoor_areas?.includes(id) ? ['outdoor' as const] : []),
    ]
    return html`
        ${this.field(this.l('ed.tool'), html`${this.seg<Tool>(
          [['hide', 'ed.tool_hide'], ['outdoor', 'ed.tool_outdoor'], ['only', 'ed.tool_only']], this.tool, tool => (this.tool = tool))}
          <span class="hint tool-hint">${this.l(`ed.tool_${this.tool}_hint` as Key)}</span>
          ${house({
            hass: this.hass!, outsideLabel: this.l('other_rooms'), markLabel: this.markLabel, marks,
            active: TOOL_MARKS[this.tool], faded,
            onRoom: id => this.change({ [key]: toggleIn(c[key], id) }),
            // Storeys narrow the dashboard to whole floors, whatever tool is active
            onFloor: id => this.change({ floors: toggleIn(c.floors, id) }),
            floorPressed: id => !!c.floors?.includes(id),
          })}
          ${this.houseSummary()}`)}
        ${this.field(this.l('ed.hide_domains'), this.chips(
          DOMAINS.map(d => ({ id: d, label: this.l(`dom.${d}`) })), c.hide_domains, hide_domains => this.change({ hide_domains })))}
        ${this.field(this.l('ed.hide_pages'), this.chips(
          PAGES.map(p => ({ id: p, label: this.l(p) })), c.hide_pages, hide_pages => this.change({ hide_pages: hide_pages as PagePath[] })),
          this.l('ed.hide_pages_hint'))}
        ${this.labelOptions.length ? this.field(this.l('ed.hide_labels'), this.chips(
          this.labelOptions, c.hide_labels, hide_labels => this.change({ hide_labels })), this.l('ed.hide_labels_hint')) : nothing}
        ${this.field(this.l('ed.order'), html`<div class="order">
          ${ordered.map((area, i) => html`<div>
            <span>${area.name}</span>
            <button class="icon-btn" aria-label="↑" ?disabled=${i === 0} @click=${() => move(i, -1)}>↑</button>
            <button class="icon-btn" aria-label="↓" ?disabled=${i === ordered.length - 1} @click=${() => move(i, 1)}>↓</button>
          </div>`)}
          ${c.area_order?.length ? html`<button class="link" @click=${() => this.change({ area_order: undefined })}>${this.l('ed.reset')}</button>` : nothing}
        </div>`)}`
  }

  /** The status chips by the name they carry; the lessons chip only with pupils in the house */
  private get chipOptions() {
    const school = findSchools(this.hass!).length > 0
    return CHIPS.filter(k => k !== 'school' || school)
      .map(k => ({ id: k, label: this.l(EVENT_CHIPS.includes(k) ? `ed.chip_${k as 'school'}` : `status.${k as 'lights'}`) }))
  }

  private renderUsers() {
    const rules = Object.entries(this.config.users ?? {})
    const free = [
      ...this.users.filter(u => !this.config.users?.[u.id]).map(u => ({ id: u.id, label: u.name })),
      ...(this.config.users?.default ? [] : [{ id: 'default', label: this.l('ed.default_user') }]),
    ]
    return html`
        <span class="hint">${this.l('ed.users_hint')}</span>
        ${rules.map(([key, rule]) => this.renderRule(key, rule))}
        ${free.length ? html`<select @change=${(e: Event) => {
          const select = e.target as HTMLSelectElement
          if (select.value) this.changeRule(select.value, {})
          select.value = ''
        }}>
          <option value="">${this.l('ed.add_user')}</option>
          ${free.map(o => html`<option value=${o.id}>${o.label}</option>`)}
        </select>` : nothing}`
  }

  private renderRule(key: string, rule: UserRule) {
    return html`<div class="rule">
      <div class="rule-head">
        <span>${this.userLabel(key)}</span>
        <button class="link" @click=${() => this.changeRule(key, null)}>${this.l('ed.remove')}</button>
      </div>
      ${this.field(this.l('ed.access'), this.seg<Access>(
        [['full', 'ed.access_full'], ['no_critical', 'ed.access_no_critical'], ['read_only', 'ed.access_read_only']],
        accessOf(rule), access => this.changeRule(key, { access })), this.l('ed.access_hint'))}
      ${this.field(this.l('ed.hide_pages'), this.chips(
        PAGES.map(p => ({ id: p, label: this.l(p) })),
        rule.hide_pages, hide_pages => this.changeRule(key, { hide_pages: hide_pages as PagePath[] })))}
      ${this.field(this.l('ed.hide_chips'), this.chips(this.chipOptions,
        rule.hide_chips, hide_chips => this.changeRule(key, { hide_chips: hide_chips as StatusChip[] })))}
      ${this.field(this.l('ed.face'), this.faceFields(rule.face, face => this.changeRule(key, { face }), true))}
      ${this.toggle(this.l('ed.settings_allowed'), rule.settings !== false, on => this.changeRule(key, { settings: on ? undefined : false }))}
      <span class="hint">${this.l('ed.settings_allowed_hint')}</span>
      ${this.field(this.l('ed.rule_rooms'), house({
        hass: this.hass!, outsideLabel: this.l('other_rooms'), markLabel: this.markLabel,
        marks: id => rule.areas?.includes(id) ? ['only'] : [],
        onRoom: id => this.changeRule(key, { areas: rule.areas?.includes(id) ? rule.areas.filter(x => x !== id) : [...(rule.areas ?? []), id] }),
        onFloor: id => this.changeRule(key, { floors: rule.floors?.includes(id) ? rule.floors.filter(x => x !== id) : [...(rule.floors ?? []), id] }),
        floorPressed: id => !!rule.floors?.includes(id),
      }), this.l('ed.rule_rooms_hint'))}
    </div>`
  }
}
