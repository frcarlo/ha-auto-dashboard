// The quick search: a field over the page that finds pages, rooms and devices as you type, with chips to narrow
// the hits by kind. Opens from the magnifier in the nav bar, or with "/" on a keyboard. A page or room opens,
// a device shows HA's details; lights and switches also switch right from the list.
// The nav bar places one per dashboard inside HA's tree, so the details dialog it opens reaches HA.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { tokens } from '../styles/tokens'
import { t, type Key } from '../i18n'
import { domainOf, entityIcon, isActive, isUnavailable, stateColor } from '../presentation'
import { kindsFor, search, type SearchHit, type SearchKind, type SearchPage, type SearchSettings } from '../search'

export interface SpotlightConfig extends BaseConfig {
  search: SearchSettings
  pages: SearchPage[]
}

const KIND_LABEL: Record<SearchKind, Key> = {
  page: 'search.pages', room: 'rooms', light: 'lights', switch: 'search.switches', cover: 'covers',
  climate: 'climate', media: 'search.media', sensor: 'search.sensors', scene: 'search.scenes', other: 'search.other',
}

/** Switched from the list without opening anything */
const SWITCHABLE = ['light', 'switch', 'input_boolean', 'fan', 'siren']
const RUNNABLE = ['scene', 'script', 'button', 'input_button']

/** Typing in a field of the page keeps its "/" */
function typing(e: KeyboardEvent) {
  return e.composedPath().some(el => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

export class AdSpotlight extends BaseCard<SpotlightConfig> {
  static properties = { ...BaseCard.properties, open: { state: true }, query: { state: true }, kind: { state: true }, active: { state: true } }

  open = false
  query = ''
  kind?: SearchKind
  /** The highlighted hit, for the arrow keys */
  active = 0
  private hits: SearchHit[] = []
  /** The order a list came up in, kept while query and kind stay, so a light switched on doesn't jump to the top under the finger */
  private listed?: { key: string; order: Map<string, number> }
  private lastFocus?: Element | null

  private onKey = (e: KeyboardEvent) => {
    if (this.open) {
      if (e.key === 'Escape') { e.preventDefault(); this.close() }
      return
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e)) {
      e.preventDefault()
      this.show()
    }
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('keydown', this.onKey)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.onKey)
  }

  show() {
    this.lastFocus = document.activeElement
    this.open = true
    this.query = ''
    this.kind = undefined
    this.active = 0
    this.listed = undefined
    this.updateComplete.then(() => this.renderRoot.querySelector('input')?.focus())
  }

  close() {
    this.open = false
    ;(this.lastFocus as HTMLElement | null)?.focus?.()
    this.lastFocus = undefined
  }

  /** The states of the hits shown, so a switch from the list shows at once */
  protected watched() {
    return this.open ? this.hits.flatMap(h => (h.entity ? [h.id] : [])) : []
  }

  protected shouldUpdate(changed: Map<string | number | symbol, unknown>) {
    // Closed, nothing on screen changes with the states
    if (!this.open && !changed.has('open')) return false
    return super.shouldUpdate(changed as never)
  }

  protected updated() {
    this.toggleAttribute('open', this.open)
    this.renderRoot.querySelector('.hit.active')?.scrollIntoView({ block: 'nearest' })
  }

  private pick(hit: SearchHit) {
    this.close()
    if (hit.kind === 'page') return this.navigate(hit.id)
    if (hit.kind === 'room') return this.navigate(`area-${hit.id}`)
    this.moreInfo(hit.id)
  }

  private onInput(e: Event) {
    this.query = (e.target as HTMLInputElement).value
    this.active = 0
  }

  private onFieldKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = this.hits.length
      if (n) this.active = (this.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
    } else if (e.key === 'Enter') {
      const hit = this.hits[this.active]
      if (hit) this.pick(hit)
    }
  }

  private choose(kind?: SearchKind) {
    this.kind = this.kind === kind ? undefined : kind
    this.active = 0
    this.renderRoot.querySelector('input')?.focus()
  }

  private stateText(entity: NonNullable<SearchHit['entity']>) {
    const { value, unit } = this.value(entity)
    return unit ? `${value} ${unit}` : value
  }

  private trailing(hit: SearchHit) {
    const entity = hit.entity
    if (!entity) return html`<ha-icon class="go" icon="mdi:chevron-right"></ha-icon>`
    const domain = domainOf(entity.entity_id)
    const off = isUnavailable(entity) && !RUNNABLE.includes(domain)
    if ((SWITCHABLE.includes(domain) || RUNNABLE.includes(domain)) && this.canControl(entity.entity_id) && !off) {
      const run = RUNNABLE.includes(domain)
      const on = !run && isActive(entity)
      return html`<button class="switch ${on ? 'on' : ''} ${this.waiting(entity.entity_id) ? 'busy' : ''}"
        role=${run ? nothing : 'switch'} aria-checked=${run ? nothing : String(on)} aria-label=${hit.title}
        @click=${(e: Event) => { e.stopPropagation(); this.toggle(entity) }}>
        <ha-icon icon=${run ? 'mdi:play' : 'mdi:power'}></ha-icon>
      </button>`
    }
    return html`<span class="state">${this.stateText(entity)}</span>`
  }

  private hit(hit: SearchHit, i: number) {
    const entity = hit.entity
    const color = entity ? stateColor(entity) : 'primary'
    const icon = entity ? (entity.attributes.icon as string | undefined) ?? entityIcon(entity) : hit.icon
    return html`<li class="hit ${i === this.active ? 'active' : ''}" role="option" id="hit-${i}" aria-selected=${i === this.active}
      @click=${() => this.pick(hit)} @pointermove=${() => { if (this.active !== i) this.active = i }}>
      <span class="icon ${color}"><ha-icon icon=${icon ?? 'mdi:circle-outline'}></ha-icon></span>
      <span class="text"><strong>${hit.title}</strong>${hit.sub || !entity ? html`<span>${hit.sub ?? t(this.hass, KIND_LABEL[hit.kind])}</span>` : nothing}</span>
      ${this.trailing(hit)}
    </li>`
  }

  protected render() {
    if (!this.open || !this.config || !this.hass) return nothing
    const { search: settings, pages } = this.config
    this.hits = search(this.hass, settings, pages, this.query, this.kind)
    const key = `${this.kind ?? ''}|${this.query}`
    if (this.listed?.key !== key) this.listed = { key, order: new Map(this.hits.map((h, i) => [h.id, i])) }
    else {
      const order = this.listed.order
      this.hits.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
    }
    const kinds = kindsFor(this.hass, settings, pages, this.query, this.kind)
    const active = Math.min(this.active, Math.max(0, this.hits.length - 1))
    return html`
      <div class="veil" @click=${() => this.close()}></div>
      <div class="panel card" role="dialog" aria-modal="true" aria-label=${t(this.hass, 'search.open')}>
        <label class="field">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input type="search" .value=${this.query} placeholder=${t(this.hass, 'search.placeholder')} autocomplete="off" spellcheck="false"
            role="combobox" aria-expanded="true" aria-controls="hits" aria-activedescendant=${this.hits.length ? `hit-${active}` : nothing}
            @input=${this.onInput} @keydown=${this.onFieldKey}>
          <button class="close" aria-label=${t(this.hass, 'popup.close')} @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
        </label>
        <div class="chips" role="group" aria-label=${t(this.hass, 'search.filter')}>
          <button class="chip" aria-pressed=${!this.kind} @click=${() => this.choose(undefined)}>${t(this.hass, 'search.all')}</button>
          ${kinds.map(k => html`<button class="chip" aria-pressed=${this.kind === k} @click=${() => this.choose(k)}>${t(this.hass, KIND_LABEL[k])}</button>`)}
        </div>
        ${this.hits.length
          ? html`<ul id="hits" role="listbox">${this.hits.map((h, i) => this.hit(h, i))}</ul>`
          : html`<p class="none">${this.query.trim() ? t(this.hass, 'search.none', { q: this.query.trim() }) : t(this.hass, 'search.hint')}</p>`}
      </div>`
  }

  static styles = [tokens, css`
    :host { position: fixed; inset: 0; z-index: 9; display: none; }
    :host([open]) { display: block; }
    .veil { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); animation: fade 0.2s ease both; }
    .panel {
      position: absolute; left: 50%; top: max(calc(env(safe-area-inset-top) + 12px), 10dvh); transform: translateX(-50%);
      width: min(640px, calc(100vw - 24px)); max-height: min(72dvh, 640px); height: auto; box-sizing: border-box;
      display: flex; flex-direction: column; gap: 10px; padding: 12px; overflow: hidden;
      animation: drop 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes fade { from { opacity: 0; } }
    @keyframes drop { from { opacity: 0; transform: translate(-50%, -8px); } }
    @media (prefers-reduced-motion: reduce) { .veil, .panel { animation: none; } }
    button { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .field {
      display: flex; align-items: center; gap: 10px; padding: 0 6px 0 14px; height: 52px; border-radius: 16px;
      background: rgba(var(--ad-on-surface), 0.07);
    }
    .field:focus-within { box-shadow: inset 0 0 0 2px rgb(var(--ad-primary)); }
    .field > ha-icon { --mdc-icon-size: 22px; opacity: var(--ad-o2); }
    input { all: unset; flex: 1; min-width: 0; font-size: var(--ad-fs-m); color: rgb(var(--ad-on-surface)); }
    input::placeholder { color: rgba(var(--ad-on-surface), 0.5); }
    input::-webkit-search-cancel-button { display: none; }
    .close { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; opacity: var(--ad-o2); }
    .close:hover { opacity: 1; background: rgba(var(--ad-on-surface), 0.08); }
    .chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; flex: none; }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      flex: none; padding: 7px 13px; border-radius: 999px; font-size: var(--ad-fs-s); white-space: nowrap;
      background: rgba(var(--ad-on-surface), 0.07); transition: background 0.15s ease, color 0.15s ease;
    }
    .chip:hover { background: rgba(var(--ad-on-surface), 0.12); }
    .chip[aria-pressed=true] { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
    .hit { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 14px; cursor: pointer; min-height: 44px; }
    .hit.active { background: rgba(var(--ad-on-surface), 0.08); }
    .icon { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; background: rgba(var(--ad-on-surface), 0.07); }
    .icon ha-icon { --mdc-icon-size: 20px; }
    .icon.primary { color: rgb(var(--ad-primary)); background: rgba(var(--ad-primary), 0.14); }
    .icon.warning { color: rgb(var(--ad-warning)); background: rgba(var(--ad-warning), 0.14); }
    .icon.error { color: rgb(var(--ad-error)); background: rgba(var(--ad-error), 0.14); }
    .icon.success { color: rgb(var(--ad-success)); background: rgba(var(--ad-success), 0.14); }
    .icon.info { color: rgb(var(--ad-info, var(--ad-primary))); }
    .icon.muted { opacity: 0.7; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .text strong { font-weight: 500; font-size: var(--ad-fs-m); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .text span { font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .state { flex: none; font-size: var(--ad-fs-s); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .go { --mdc-icon-size: 20px; opacity: 0.45; }
    .switch {
      flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%;
      background: rgba(var(--ad-on-surface), 0.08); transition: background 0.15s ease, color 0.15s ease;
    }
    .switch ha-icon { --mdc-icon-size: 20px; }
    .switch.on { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .switch.busy { animation: ad-wait 1.2s ease-in-out infinite alternate; }
    @media (prefers-reduced-motion: reduce) { .switch.busy { animation: none; opacity: 0.6; } }
    .none { margin: 6px 4px 10px; font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
  `]
}
