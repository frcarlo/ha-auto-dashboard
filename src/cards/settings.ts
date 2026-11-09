// The user's own settings page: look, nav bar, face, pages and favorites, for this user only.
// What the dashboard sets is the starting point; only what the user changes is stored (see personal.ts).
import { css, html, nothing, type TemplateResult } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { allEntities, entityAreaId, hideOf } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { loadPersonal, personalDiff, savePersonal, type PersonalSettings } from '../personal'
import { tokens } from '../styles/tokens'
import type { FaceConfig, FaceStyle, NavPosition, PagePath, ThemeMode } from '../types'

interface SettingsConfig extends BaseConfig {
  /** The dashboard's url path: settings are kept per dashboard */
  dashboard: string
  /** What the dashboard has set, before the user's own settings */
  base: Required<Pick<PersonalSettings, 'theme' | 'glass' | 'nav_position' | 'favorites'>> & { primary_color?: string; face: FaceConfig | false }
  /** The pages of the nav bar the user may switch off */
  pages: { path: string; icon: string; label: string }[]
  /** The admin switched the face off for this user */
  face_locked?: boolean
  areas?: string[]
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
  }

  /** What the page shows: the dashboard's values with the user's own on top, plus unsaved changes */
  draft?: PersonalSettings
  /** The draft as last loaded or saved, to tell whether something changed */
  saved = ''
  query = ''
  busy = false
  error = ''
  private loading = false

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; }
    button { all: unset; box-sizing: border-box; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .intro { font-size: 14px; opacity: 0.65; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    @container (max-width: 760px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .panel { padding: 18px 20px 20px; height: auto; display: flex; flex-direction: column; gap: 18px; }
    .panel.wide { grid-row: span 2; }
    h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
    .hint { font-size: 12px; opacity: 0.6; line-height: 1.4; }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .label { font-size: 13px; font-weight: 600; opacity: 0.8; }

    .seg { display: inline-flex; flex-wrap: wrap; align-self: flex-start; padding: 3px; gap: 2px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.07); }
    .seg button { padding: 7px 14px; border-radius: 9px; font-size: 13px; }
    .seg button[aria-pressed=true] { background: rgb(var(--ad-primary)); color: #fff; font-weight: 600; }

    .colors { display: flex; flex-wrap: wrap; gap: 10px; }
    .swatch { width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .swatch[aria-pressed=true] { box-shadow: 0 0 0 2px var(--ad-surface), 0 0 0 4px rgb(var(--ad-on-surface)); }

    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; padding: 2px 0; }
    .row .what { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .row ha-icon { --mdc-icon-size: 20px; opacity: 0.7; }
    .switch { position: relative; flex: none; width: 42px; height: 24px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.18); transition: background 0.2s ease; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s ease; }
    .switch[aria-checked=true] { background: rgb(var(--ad-primary)); }
    .switch[aria-checked=true]::after { transform: translateX(18px); }
    .pages { display: flex; flex-direction: column; gap: 6px; }

    .favs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .favs li { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
    .favs li + li { border-top: 1px solid rgba(var(--ad-on-surface), 0.07); }
    .favs ha-icon { --mdc-icon-size: 20px; opacity: 0.7; flex: none; }
    .name { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 14px; }
    .name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name .area { font-size: 12px; opacity: 0.55; }
    .icon-btn { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; }
    .icon-btn:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .icon-btn[disabled] { opacity: 0.25; pointer-events: none; }
    .icon-btn ha-icon { --mdc-icon-size: 18px; opacity: 0.8; }
    .empty { font-size: 14px; opacity: 0.55; }
    input[type=search] {
      all: unset; box-sizing: border-box; width: 100%; padding: 10px 14px; border-radius: 12px; font-size: 14px;
      background: rgba(var(--ad-on-surface), 0.07);
    }
    .results { display: flex; flex-direction: column; }
    .result { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; }
    .result:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .result ha-icon { --mdc-icon-size: 20px; opacity: 0.7; }
    .result .add { --mdc-icon-size: 18px; color: rgb(var(--ad-primary)); opacity: 1; }

    /* Above the panels, where the nav bar never covers it, whether it floats at the bottom or the top */
    .actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; margin: 0 0 16px; }
    .actions .intro { margin: 0 auto 0 0; }
    .actions .state { font-size: 13px; opacity: 0.65; }
    .actions .error { flex-basis: 100%; font-size: 13px; color: rgb(var(--ad-error)); }
    .primary { padding: 10px 20px; border-radius: 12px; background: rgb(var(--ad-primary)); color: #fff; font-weight: 600; font-size: 14px; }
    .primary[disabled] { opacity: 0.4; pointer-events: none; }
    .link { padding: 10px 12px; border-radius: 12px; font-size: 14px; color: rgb(var(--ad-primary)); }
    .link:hover { background: rgba(var(--ad-primary), 0.1); }
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

  private seg<T extends string>(options: [T, string][], value: T, pick: (v: T) => void) {
    return html`<div class="seg" role="group">${options.map(([v, label]) => html`
      <button aria-pressed=${value === v} @click=${() => pick(v)}>${label}</button>`)}</div>`
  }

  private field(label: string, content: TemplateResult, hint?: string) {
    return html`<div class="field"><span class="label">${label}</span>${content}${hint ? html`<span class="hint">${hint}</span>` : nothing}</div>`
  }

  private switchRow(content: TemplateResult, checked: boolean, label: string, toggle: (v: boolean) => void) {
    return html`<div class="row"><span class="what">${content}</span>
      <button class="switch" role="switch" aria-checked=${checked} aria-label=${label} @click=${() => toggle(!checked)}></button></div>`
  }

  private renderLook(d: PersonalSettings) {
    const color = d.primary_color ?? SWATCHES[0]
    return html`<section class="card panel">
      <h2>${this.l('set.look')}</h2>
      ${this.field(this.l('ed.theme'), this.seg<ThemeMode>(
        [['auto', this.l('ed.theme_auto')], ['dark', this.l('ed.theme_dark')], ['light', this.l('ed.theme_light')]],
        d.theme ?? 'auto', theme => this.set({ theme })))}
      ${this.field(this.l('ed.primary'), html`<div class="colors">${SWATCHES.map(c => html`
        <button class="swatch" style="background:${c}" aria-label=${c} aria-pressed=${color === c}
          @click=${() => this.set({ primary_color: c === SWATCHES[0] ? undefined : c })}></button>`)}</div>`)}
      ${this.switchRow(html`${this.l('ed.glass')}`, !!d.glass, this.l('ed.glass'), glass => this.set({ glass }))}
      ${this.field(this.l('ed.nav'), this.seg<NavPosition>(
        [['bottom', this.l('ed.nav_bottom')], ['top', this.l('ed.nav_top')], ['left', this.l('ed.nav_left')], ['right', this.l('ed.nav_right')]],
        d.nav_position ?? 'bottom', nav_position => this.set({ nav_position })))}
      ${this.renderFace(d)}
    </section>`
  }

  private renderFace(d: PersonalSettings) {
    if (this.config!.face_locked) return this.field(this.l('ed.face'), html`<span class="hint">${this.l('set.face_locked')}</span>`)
    const face = d.face
    const styles: [FaceStyle | 'off', string][] = [
      ['off', this.l('ed.face_off')], ['clock', this.l('face.clock')], ['analog', this.l('face.analog')],
      ['photo', this.l('face.photo')], ['calendar', this.l('face.calendar')],
    ]
    const lang = this.hass?.language
    const minutes = new Intl.NumberFormat(lang, { style: 'unit', unit: 'minute', unitDisplay: 'short' })
    const seconds = new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', unitDisplay: 'short' })
    const after = face ? face.after ?? 120 : 120
    return this.field(this.l('ed.face'), html`
      ${this.seg(styles, face ? face.style ?? 'clock' : 'off', v => this.set({ face: v === 'off' ? false : { ...(face || {}), style: v } }))}
      ${face ? this.seg(WAITS.map(w => [String(w), w === 0 ? this.l('ed.face_now') : w < 60 ? seconds.format(w) : minutes.format(w / 60)] as [string, string]),
        String(after), v => this.set({ face: { ...face, after: Number(v) } })) : nothing}`)
  }

  private renderPages(d: PersonalSettings) {
    const hidden = new Set(d.hide_pages ?? [])
    return html`<section class="card panel">
      <h2>${this.l('set.pages')}</h2>
      <div class="pages">${this.config!.pages.map(p => this.switchRow(
        html`<ha-icon icon=${p.icon}></ha-icon><span>${p.label}</span>`, !hidden.has(p.path as PagePath), p.label,
        on => this.set({ hide_pages: on ? [...hidden].filter(x => x !== p.path) : [...hidden, p.path as PagePath] })))}</div>
      <span class="hint">${this.l('set.pages_hint')}</span>
    </section>`
  }

  private describe(id: string) {
    const hass = this.hass!
    const e = hass.states[id]
    const area = hass.areas[entityAreaId(hass, id) ?? '']?.name
    return { e, name: e ? shortName(entityName(e), area) : id, area }
  }

  /** Entities the user can see on this dashboard and has not picked yet, matching the search by name, room or id */
  private get results() {
    const q = this.query.trim().toLowerCase()
    if (!q) return []
    const picked = new Set(this.draft?.favorites ?? [])
    const c = this.config!
    return allEntities(this.hass!, hideOf(c), c.areas?.length ? c.areas : undefined)
      .filter(e => !picked.has(e.entity_id))
      .map(e => ({ id: e.entity_id, ...this.describe(e.entity_id) }))
      .filter(r => `${r.name} ${r.area ?? ''} ${r.id}`.toLowerCase().includes(q))
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
    return html`<section class="card panel wide">
      <h2>${this.l('set.favorites')}</h2>
      <span class="hint">${this.l('set.favorites_hint')}</span>
      ${list.length ? html`<ul class="favs">${list.map((id, i) => {
        const r = this.describe(id)
        return html`<li>
          <ha-icon icon=${entityIcon(r.e)}></ha-icon>
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
          <ha-icon icon=${entityIcon(r.e)}></ha-icon>
          <span class="name"><span>${r.name}</span>${r.area ? html`<span class="area">${r.area}</span>` : nothing}</span>
          <ha-icon class="add" icon="mdi:plus-circle-outline"></ha-icon>
        </button>`) : html`<span class="empty">${this.l('set.no_match')}</span>`}</div>` : nothing}
    </section>`
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
      <div class="grid">
        ${this.renderLook(d)}
        ${this.renderFavorites(d)}
        ${this.config!.pages.length ? this.renderPages(d) : nothing}
      </div>`
  }
}
