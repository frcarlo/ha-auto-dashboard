// The user's own settings page: look, nav bar, face, pages and favorites, for this user only.
// What the dashboard sets is the starting point; only what the user changes is stored (see personal.ts).
import { css, html, nothing, type TemplateResult } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { allEntities, entityAreaId, hideOf, isRoomFavorite } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { loadPersonal, personalDiff, savePersonal, type PersonalSettings } from '../personal'
import { tokens } from '../styles/tokens'
import type { FaceConfig, FaceStyle, NavPosition, OwnCardsPage, PagePath, ThemeMode } from '../types'

interface SettingsConfig extends BaseConfig {
  /** The dashboard's url path: settings are kept per dashboard */
  dashboard: string
  /** What the dashboard has set, before the user's own settings */
  base: Required<Pick<PersonalSettings, 'theme' | 'glass' | 'nav_position' | 'favorites'>> & { primary_color?: string; face: FaceConfig | false; floor_tabs?: boolean; floor_start?: string; page_floors?: boolean }
  /** The pages of the nav bar the user may switch off */
  pages: { path: string; icon: string; label: string }[]
  /** The admin switched the face off for this user */
  face_locked?: boolean
  areas?: string[]
  /** The floors on Home, when there is more than one, so floor tabs make sense */
  floors?: { id: string; name: string }[]
  /** The rooms shown on this dashboard, in their order, for favorite rooms */
  rooms?: string[]
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

const SWATCHES = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f43f5e', '#a855f7', '#64748b']
const WAITS = [0, 30, 60, 120, 300, 600]
const MAX_RESULTS = 8

export class AdSettings extends BaseCard<SettingsConfig> {
  static properties = {
    ...BaseCard.properties,
    draft: { state: true },
    saved: { state: true },
    query: { state: true },
    busy: { state: true },
    error: { state: true },
    cardsPage: { state: true },
    cardsSlot: { state: true },
    cardsError: { state: true },
  }

  /** What the page shows: the dashboard's values with the user's own on top, plus unsaved changes */
  draft?: PersonalSettings
  /** The draft as last loaded or saved, to tell whether something changed */
  saved = ''
  query = ''
  busy = false
  error = ''
  /** Page and place whose own cards are being edited */
  cardsPage: OwnCardsPage = 'home'
  cardsSlot: 'top' | 'bottom' = 'top'
  cardsError = false
  private loading = false

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    button { all: unset; box-sizing: border-box; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .intro { font-size: var(--ad-fs-m); opacity: var(--ad-o2); }
    /* Two columns of their own, so a long card on one side leaves no hole on the other; on a phone one column in reading order */
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    @container (max-width: 760px) {
      .cols { display: flex; flex-direction: column; }
      .col { display: contents; }
    }
    .panel { padding: 18px 20px 20px; height: auto; display: flex; flex-direction: column; gap: 18px; }
    h2 { margin: 0; display: flex; align-items: center; gap: 12px; font-size: var(--ad-fs-l); font-weight: 600; letter-spacing: -0.01em; }
    h2 .badge {
      flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px;
      background: rgba(var(--ad-primary), 0.14); color: rgb(var(--ad-primary));
    }
    h2 .badge ha-icon { --mdc-icon-size: 19px; }
    h2 .title { flex: 1; min-width: 0; }
    h2 .count { font-size: var(--ad-fs-s); font-weight: 500; opacity: var(--ad-o2); }
    .panel > .hint:first-of-type { margin-top: -8px; }
    .hint { font-size: var(--ad-fs-s); opacity: var(--ad-o2); line-height: 1.4; }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: var(--ad-fs-s); font-weight: 600; opacity: 0.8; }
    .row .what { flex: 1; }
    /* The way back to the dashboard's value, next to a value the user set apart from it */
    .back { flex: none; font-size: var(--ad-fs-s); font-weight: 500; color: rgb(var(--ad-primary)); opacity: 1; padding: 2px 6px; margin: -2px -6px; border-radius: 8px; }
    .back:hover { background: rgba(var(--ad-primary), 0.1); }

    .seg { display: inline-flex; flex-wrap: wrap; align-self: flex-start; padding: 3px; gap: 2px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.07); }
    .seg button { padding: 7px 14px; border-radius: 9px; font-size: var(--ad-fs-s); }
    .seg button[aria-pressed=true] { background: rgb(var(--ad-primary)); color: #fff; font-weight: 600; }

    .colors { display: flex; flex-wrap: wrap; gap: 10px; }
    .swatch { width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .swatch[aria-pressed=true] { box-shadow: 0 0 0 2px var(--ad-surface), 0 0 0 4px rgb(var(--ad-on-surface)); }

    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: var(--ad-fs-m); padding: 2px 0; }
    .row .what { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .row ha-icon { --mdc-icon-size: 20px; opacity: var(--ad-o2); }
    .switch { position: relative; flex: none; width: 42px; height: 24px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.18); transition: background 0.2s ease; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s ease; }
    .switch[aria-checked=true] { background: rgb(var(--ad-primary)); }
    .switch[aria-checked=true]::after { transform: translateX(18px); }
    /* Pages of the bar as chips: on in the accent, off only outlined, so the bar's content reads at a glance */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px 8px 10px; border-radius: 12px;
      font-size: var(--ad-fs-s); font-weight: 500; background: rgba(var(--ad-primary), 0.16); color: rgb(var(--ad-on-surface));
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .chip ha-icon { --mdc-icon-size: 18px; color: rgb(var(--ad-primary)); }
    .chip[aria-pressed=false] { background: transparent; box-shadow: inset 0 0 0 1px rgba(var(--ad-on-surface), 0.18); opacity: 0.6; }
    .chip[aria-pressed=false] ha-icon { color: inherit; }

    /* Own cards are for those who know Lovelace YAML: folded away until opened or in use */
    details.panel { gap: 0; }
    details > summary { list-style: none; cursor: pointer; border-radius: 12px; }
    details > summary::-webkit-details-marker { display: none; }
    details > summary:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 4px; }
    details .chev { --mdc-icon-size: 22px; opacity: var(--ad-o2); transition: transform 0.2s ease; }
    details[open] .chev { transform: rotate(180deg); }
    details .body { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }

    .favs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .favs li { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
    .favs li + li { border-top: 1px solid rgba(var(--ad-on-surface), 0.07); }
    .favs ha-icon { --mdc-icon-size: 20px; opacity: var(--ad-o2); flex: none; }
    .name { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--ad-fs-m); }
    .name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name .area { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .icon-btn { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; }
    .icon-btn:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .icon-btn[disabled] { opacity: 0.25; pointer-events: none; }
    .icon-btn ha-icon { --mdc-icon-size: 18px; opacity: 0.8; }
    .empty { font-size: var(--ad-fs-m); opacity: var(--ad-o2); }
    input[type=search] {
      all: unset; box-sizing: border-box; width: 100%; padding: 10px 14px; border-radius: 12px; font-size: var(--ad-fs-m);
      background: rgba(var(--ad-on-surface), 0.07);
    }
    .results { display: flex; flex-direction: column; }
    .result { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; }
    .result:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .result ha-icon { --mdc-icon-size: 20px; opacity: var(--ad-o2); }
    .result .add { --mdc-icon-size: 18px; color: rgb(var(--ad-primary)); opacity: 1; }

    /* Above the panels, where the nav bar never covers it, whether it floats at the bottom or the top */
    .actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; margin: 0 0 16px; }
    .actions .intro { margin: 0 auto 0 0; }
    .actions .state { font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
    .actions .error { flex-basis: 100%; font-size: var(--ad-fs-s); color: rgb(var(--ad-error)); }
    .primary { padding: 10px 20px; border-radius: 12px; background: rgb(var(--ad-primary)); color: #fff; font-weight: 600; font-size: var(--ad-fs-m); }
    .primary[disabled] { opacity: 0.4; pointer-events: none; }
    .link { padding: 10px 12px; border-radius: 12px; font-size: var(--ad-fs-m); color: rgb(var(--ad-primary)); }
    .link:hover { background: rgba(var(--ad-primary), 0.1); }

    select {
      all: unset; box-sizing: border-box; width: 100%; padding: 10px 14px; border-radius: 12px; font-size: var(--ad-fs-m); cursor: pointer;
      background: rgba(var(--ad-on-surface), 0.07);
    }
    select option { color: #111; }
    textarea {
      box-sizing: border-box; width: 100%; min-height: 140px; padding: 10px 12px; border: 0; border-radius: 12px; resize: vertical;
      font: 12px/1.5 var(--code-font-family, ui-monospace, monospace); color: inherit; background: rgba(var(--ad-on-surface), 0.07);
    }
    ha-yaml-editor { display: block; border-radius: 12px; overflow: hidden; }
    .hint.error { color: rgb(var(--ad-error)); opacity: 1; }
  `]

  getCardSize() {
    return 10
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  protected updated() {
    if (!this.draft && !this.loading && this.hass) void this.load()
  }

  private async load() {
    this.loading = true
    const own = await loadPersonal(this.hass!, this.config!.dashboard)
    this.draft = this.fromBase(own)
    this.saved = JSON.stringify(this.draft)
    this.loading = false
  }

  /** The dashboard's values, with what the user set on top */
  private fromBase(own?: PersonalSettings): PersonalSettings {
    const { base } = this.config!
    return { ...base, hide_pages: [], ...(own ?? {}) }
  }

  private set(patch: Partial<PersonalSettings>) {
    this.draft = { ...this.draft!, ...patch }
    this.error = ''
  }

  private async save(reset = false) {
    const hass = this.hass!
    const value = reset ? null : personalDiff(this.draft!, this.config!.base)
    this.busy = true
    try {
      await savePersonal(hass, this.config!.dashboard, value)
      // The dashboard is built once per load, so it is built again with the new settings
      location.reload()
    } catch (e) {
      this.busy = false
      this.error = t(hass, 'set.error', { error: (e as Error)?.message ?? String(e) })
    }
  }

  private l(key: Key) {
    return t(this.hass, key)
  }

  private head(icon: string, title: string, extra: unknown = nothing) {
    return html`<h2><span class="badge"><ha-icon icon=${icon}></ha-icon></span><span class="title">${title}</span>${extra}</h2>`
  }

  private seg<T extends string>(options: [T, string][], value: T, pick: (v: T) => void) {
    return html`<div class="seg" role="group">${options.map(([v, label]) => html`
      <button aria-pressed=${value === v} @click=${() => pick(v)}>${label}</button>`)}</div>`
  }

  private field(label: string, content: TemplateResult, hint?: string, own?: (keyof PersonalSettings)[]) {
    return html`<div class="field"><span class="label">${label}${own ? this.back(own) : nothing}</span>${content}${hint ? html`<span class="hint">${hint}</span>` : nothing}</div>`
  }

  private switchRow(content: TemplateResult, checked: boolean, label: string, toggle: (v: boolean) => void, own?: (keyof PersonalSettings)[]) {
    return html`<div class="row"><span class="what">${content}</span>${own ? this.back(own) : nothing}
      <button class="switch" role="switch" aria-checked=${checked} aria-label=${label} @click=${() => toggle(!checked)}></button></div>`
  }

  /**
   * A value the user set apart from the dashboard wins over it, also when the admin changes the dashboard later.
   * This says so and takes the dashboard's value back; saved, the own value is gone and the dashboard's applies again.
   */
  private back(keys: (keyof PersonalSettings)[]) {
    const base = this.config!.base as PersonalSettings
    const d = this.draft!
    const same = (key: keyof PersonalSettings) => JSON.stringify(d[key] ?? null) === JSON.stringify(base[key] ?? null)
    if (keys.every(same)) return nothing
    return html`<button class="back" title=${this.l('set.own_hint')}
      @click=${() => this.set(Object.fromEntries(keys.map(key => [key, base[key]])) as Partial<PersonalSettings>)}>${this.l('set.as_dashboard')}</button>`
  }

  private renderLook(d: PersonalSettings) {
    const color = d.primary_color ?? SWATCHES[0]
    return html`<section class="card panel" style="order: 1">
      ${this.head('mdi:palette-outline', this.l('set.look'))}
      ${this.field(this.l('ed.theme'), this.seg<ThemeMode>(
        [['auto', this.l('ed.theme_auto')], ['dark', this.l('ed.theme_dark')], ['light', this.l('ed.theme_light')]],
        d.theme ?? 'auto', theme => this.set({ theme })), undefined, ['theme'])}
      ${this.field(this.l('ed.primary'), html`<div class="colors">${SWATCHES.map(c => html`
        <button class="swatch" style="background:${c}" aria-label=${c} aria-pressed=${color === c}
          @click=${() => this.set({ primary_color: c === SWATCHES[0] ? undefined : c })}></button>`)}</div>`, undefined, ['primary_color'])}
      ${this.switchRow(html`${this.l('ed.glass')}`, !!d.glass, this.l('ed.glass'), glass => this.set({ glass }), ['glass'])}
    </section>`
  }

  /** Floors as tabs, and which one Home opens on */
  private renderFloors(d: PersonalSettings) {
    const floors = this.config!.floors
    if (!floors?.length) return nothing
    const start = floors.some(f => f.id === d.floor_start) ? d.floor_start! : ''
    return html`<section class="card panel" style="order: 4">
      ${this.head('mdi:layers-outline', this.l('set.floors'))}
      ${this.switchRow(html`${this.l('ed.floor_tabs')}`, !!d.floor_tabs, this.l('ed.floor_tabs'), floor_tabs => this.set({ floor_tabs }), ['floor_tabs', 'floor_start'])}
      ${d.floor_tabs ? this.field(this.l('set.floor_start'), this.seg<string>(
        [['', this.l('set.floor_last')], ...floors.map(f => [f.id, f.name] as [string, string])], start,
        // "Last picked" over a dashboard that sets a floor needs '' to say so; otherwise nothing is stored
        id => this.set({ floor_start: id || (this.config!.base.floor_start ? '' : undefined) })),
        this.l('set.floor_start_hint')) : nothing}
      ${this.switchRow(html`${this.l('ed.page_floors')}`, d.page_floors !== false, this.l('ed.page_floors'), page_floors => this.set({ page_floors }), ['page_floors'])}
    </section>`
  }

  private renderFace(d: PersonalSettings) {
    const card = (content: unknown) => html`<section class="card panel" style="order: 5">
      ${this.head('mdi:clock-outline', this.l('ed.face'), this.back(['face']))}
      <span class="hint">${this.l('set.face_hint')}</span>
      ${content}
    </section>`
    if (this.config!.face_locked) return card(html`<span class="hint">${this.l('set.face_locked')}</span>`)
    const face = d.face
    const styles: [FaceStyle | 'off', string][] = [
      ['off', this.l('ed.face_off')], ['clock', this.l('face.clock')], ['analog', this.l('face.analog')],
      ['photo', this.l('face.photo')], ['calendar', this.l('face.calendar')],
    ]
    const lang = this.hass?.language
    const minutes = new Intl.NumberFormat(lang, { style: 'unit', unit: 'minute', unitDisplay: 'short' })
    const seconds = new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', unitDisplay: 'short' })
    const after = face ? face.after ?? 120 : 120
    return card(html`
      ${this.seg(styles, face ? face.style ?? 'clock' : 'off', v => this.set({ face: v === 'off' ? false : { ...(face || {}), style: v } }))}
      ${face ? this.field(this.l('ed.face_after'), this.seg(WAITS.map(w => [String(w), w === 0 ? this.l('ed.face_now') : w < 60 ? seconds.format(w) : minutes.format(w / 60)] as [string, string]),
        String(after), v => this.set({ face: { ...face, after: Number(v) } }))) : nothing}`)
  }

  /** Where the bar sits and which pages are in it */
  private renderNav(d: PersonalSettings) {
    const hidden = new Set(d.hide_pages ?? [])
    const pages = this.config!.pages
    return html`<section class="card panel" style="order: 2">
      ${this.head('mdi:dock-bottom', this.l('set.nav'))}
      ${this.field(this.l('set.nav_position'), this.seg<NavPosition>(
        [['bottom', this.l('ed.nav_bottom')], ['top', this.l('ed.nav_top')], ['left', this.l('ed.nav_left')], ['right', this.l('ed.nav_right')]],
        d.nav_position ?? 'bottom', nav_position => this.set({ nav_position })), undefined, ['nav_position'])}
      ${pages.length ? this.field(this.l('set.pages'), html`<div class="chips" role="group" aria-label=${this.l('set.pages')}>${pages.map(p => {
        const on = !hidden.has(p.path as PagePath)
        return html`<button class="chip" aria-pressed=${on}
          @click=${() => this.set({ hide_pages: on ? [...hidden, p.path as PagePath] : [...hidden].filter(x => x !== p.path) })}>
          <ha-icon icon=${p.icon}></ha-icon><span>${p.label}</span></button>`
      })}</div>`, this.l('set.pages_hint')) : nothing}
    </section>`
  }

  private describe(id: string) {
    const hass = this.hass!
    if (isRoomFavorite(id)) {
      const room = hass.areas[id]
      return { icon: room?.icon ?? 'mdi:texture-box', name: room?.name ?? id, area: this.l('set.room') }
    }
    const e = hass.states[id]
    const area = hass.areas[entityAreaId(hass, id) ?? '']?.name
    return { icon: entityIcon(e), name: e ? shortName(entityName(e), area) : id, area }
  }

  /**
   * Rooms and entities the user can see on this dashboard and has not picked yet, matching the search by name,
   * room or id. Rooms come first: "Küche" finds the kitchen before everything in it.
   */
  private get results() {
    const q = this.query.trim().toLowerCase()
    if (!q) return []
    const picked = new Set(this.draft?.favorites ?? [])
    const c = this.config!
    const rooms = (c.rooms ?? []).filter(id => this.hass!.areas[id])
    const entities = allEntities(this.hass!, hideOf(c), c.areas?.length ? c.areas : undefined).map(e => e.entity_id)
    return [...rooms, ...entities]
      .filter(id => !picked.has(id))
      .map(id => ({ id, ...this.describe(id) }))
      .filter(r => `${r.name} ${isRoomFavorite(r.id) ? '' : r.area ?? ''} ${r.id}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
  }

  private renderFavorites(d: PersonalSettings) {
    const list = d.favorites ?? []
    const move = (i: number, by: number) => {
      const next = [...list]
      const [id] = next.splice(i, 1)
      next.splice(i + by, 0, id!)
      this.set({ favorites: next })
    }
    const results = this.results
    return html`<section class="card panel" style="order: 3">
      ${this.head('mdi:star-outline', this.l('set.favorites'), this.back(['favorites']))}
      <span class="hint">${this.l('set.favorites_hint')}</span>
      ${list.length ? html`<ul class="favs">${list.map((id, i) => {
        const r = this.describe(id)
        return html`<li>
          <ha-icon icon=${r.icon}></ha-icon>
          <span class="name"><span>${r.name}</span>${r.area ? html`<span class="area">${r.area}</span>` : nothing}</span>
          <button class="icon-btn" aria-label=${this.l('set.up')} ?disabled=${i === 0} @click=${() => move(i, -1)}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
          <button class="icon-btn" aria-label=${this.l('set.down')} ?disabled=${i === list.length - 1} @click=${() => move(i, 1)}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          <button class="icon-btn" aria-label=${this.l('set.remove')} @click=${() => this.set({ favorites: list.filter(x => x !== id) })}><ha-icon icon="mdi:close"></ha-icon></button>
        </li>`
      })}</ul>` : html`<span class="empty">${this.l('set.no_favorites')}</span>`}
      <input type="search" .value=${this.query} placeholder=${this.l('set.search')} aria-label=${this.l('set.search')}
        @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value }}>
      ${this.query.trim() ? html`<div class="results">${results.length ? results.map(r => html`
        <button class="result" @click=${() => { this.set({ favorites: [...list, r.id] }); this.query = '' }}>
          <ha-icon icon=${r.icon}></ha-icon>
          <span class="name"><span>${r.name}</span>${r.area ? html`<span class="area">${r.area}</span>` : nothing}</span>
          <ha-icon class="add" icon="mdi:plus-circle-outline"></ha-icon>
        </button>`) : html`<span class="empty">${this.l('set.no_match')}</span>`}</div>` : nothing}
    </section>`
  }

  /** Own Lovelace cards on Home and the pages, for this user only, after the dashboard's */
  private renderCards(d: PersonalSettings) {
    const pages = [{ path: 'home', label: this.l('home') }, ...this.config!.pages] as { path: OwnCardsPage; label: string }[]
    const page = d.pages?.[this.cardsPage]
    const value = page?.cards?.[this.cardsSlot] ?? []
    const count = (p: OwnCardsPage) => (d.pages?.[p]?.cards?.top?.length ?? 0) + (d.pages?.[p]?.cards?.bottom?.length ?? 0)
    const set = (raw: unknown, valid = true) => {
      const list = raw === undefined || raw === null || raw === '' ? [] : Array.isArray(raw) ? raw : [raw]
      this.cardsError = !valid || !list.every(c => c && typeof c === 'object' && typeof (c as { type?: unknown }).type === 'string')
      if (this.cardsError) return
      const cards = { ...(page?.cards ?? {}), [this.cardsSlot]: list as Record<string, unknown>[] }
      this.set({ pages: { ...(d.pages ?? {}), [this.cardsPage]: { ...(page ?? {}), cards } } })
    }
    const pick = (path: OwnCardsPage) => { this.cardsPage = path; this.cardsError = false }
    const total = pages.reduce((n, p) => n + count(p.path), 0)
    return html`<details class="card panel" style="order: 6" ?open=${total > 0}>
      <summary>${this.head('mdi:code-braces', this.l('set.cards'), html`${total ? html`<span class="count">${total}</span>` : nothing}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>`)}</summary>
      <div class="body">
      <span class="hint">${this.l('set.cards_hint')}</span>
      <select aria-label=${this.l('set.cards_page')} .value=${this.cardsPage} @change=${(e: Event) => pick((e.target as HTMLSelectElement).value as OwnCardsPage)}>
        ${pages.map(p => html`<option value=${p.path} ?selected=${p.path === this.cardsPage}>${p.label}${count(p.path) ? ` (${count(p.path)})` : ''}</option>`)}
      </select>
      ${this.seg<'top' | 'bottom'>([['top', this.l('ed.page_top')], ['bottom', this.l('ed.page_bottom')]], this.cardsSlot, slot => { this.cardsSlot = slot; this.cardsError = false })}
      ${customElements.get('ha-yaml-editor')
        // HA's own YAML editor; keyed so switching page or place loads those cards
        ? keyed(`${this.cardsPage}/${this.cardsSlot}`, html`<ha-yaml-editor .hass=${this.hass} .defaultValue=${value}
            @value-changed=${(e: CustomEvent<{ value: unknown; isValid?: boolean }>) => set(e.detail.value, e.detail.isValid !== false)}></ha-yaml-editor>`)
        : keyed(`${this.cardsPage}/${this.cardsSlot}`, html`<textarea .value=${value.length ? JSON.stringify(value, null, 2) : ''} placeholder='[{"type": "markdown", "content": "…"}]'
            aria-label=${this.l('set.cards')} @change=${(e: Event) => {
              const text = (e.target as HTMLTextAreaElement).value.trim()
              try { set(text ? JSON.parse(text) : []) } catch { this.cardsError = true }
            }}></textarea>`)}
      ${this.cardsError ? html`<span class="hint error">${this.l('ed.cards_error')}</span>` : nothing}
      </div>
    </details>`
  }

  protected render() {
    const d = this.draft
    if (!d) return nothing
    const changed = JSON.stringify(d) !== this.saved
    return html`
      <div class="actions">
        <p class="intro">${this.l('set.intro')}</p>
        ${changed && !this.error ? html`<span class="state">${this.l('set.unsaved')}</span>` : nothing}
        <button class="link" ?disabled=${this.busy} @click=${() => this.save(true)}>${this.l('set.reset')}</button>
        <button class="primary" ?disabled=${this.busy || !changed} @click=${() => this.save()}>${this.busy ? this.l('set.saving') : this.l('set.save')}</button>
        ${this.error ? html`<span class="error">${this.error}</span>` : nothing}
      </div>
      <div class="cols">
        <div class="col">${this.renderLook(d)}${this.renderNav(d)}${this.renderFloors(d)}</div>
        <div class="col">${this.renderFavorites(d)}${this.renderFace(d)}${this.renderCards(d)}</div>
      </div>`
  }
}
