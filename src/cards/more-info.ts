// The window that opens in place of HA's dialog when a rule under `more_info:` says so (see more-info.ts): the
// dashboard's own player for a speaker, or any card, e.g. one from HACS. It catches HA's "more-info" event before
// HA does, so taps on HA's own cards and in the quick search open it as well. A button in its head opens HA's
// dialog after all, for the settings and history only HA has.
// The nav bar puts one into HA's tree, like the popup, so it is there on every page of the dashboard.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { tokens } from '../styles/tokens'
import { t } from '../i18n'
import { entityName } from '../presentation'
import { entityAreaId } from '../model'
import { cardReady, moreInfoFor, type MoreInfoSettings, type MoreInfoTarget } from '../more-info'
import type { HomeAssistant } from '../types'

export interface MoreInfoConfig extends BaseConfig, MoreInfoSettings {}

type Content = HTMLElement & { hass?: unknown; setConfig?: (config: object) => void }
type CardHelpers = { createCardElement(config: object): Content }
let helpers: Promise<CardHelpers> | undefined
const loadHelpers = () => {
  const load = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers
  return load ? (helpers ??= load()) : undefined
}

/** The detail HA's own dialog is opened with from here, so the window lets it pass */
const NATIVE = 'ad_native'

export class AdMoreInfo extends BaseCard<MoreInfoConfig> {
  static properties = { ...BaseCard.properties, shown: { state: true }, content: { state: true } }

  shown?: { entityId: string; target: MoreInfoTarget }
  content?: Content

  private onEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ entityId?: string; [NATIVE]?: boolean } | undefined>).detail
    const entityId = detail?.entityId
    if (!entityId || detail[NATIVE] || !this.isConnected || !this.config) return
    const path = e.composedPath()
    // Inside HA's dialog (a related entity) it stays HA's; from a card in this window it goes to HA's dialog too
    if (path.some(n => (n as Element).localName === 'ha-more-info-dialog')) return
    if (path.includes(this)) return void this.close()
    const target = moreInfoFor(this.config, entityId)
    if (!target || (target.kind === 'card' && !cardReady(target.card.type))) return
    e.stopPropagation()
    this.open(entityId, target)
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.shown) this.close()
  }

  private onLocation = () => this.close()

  connectedCallback() {
    super.connectedCallback()
    // Capturing on window comes before HA's own listener on <home-assistant>
    window.addEventListener('hass-more-info', this.onEvent, true)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('location-changed', this.onLocation)
    window.addEventListener('popstate', this.onLocation)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hass-more-info', this.onEvent, true)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('location-changed', this.onLocation)
    window.removeEventListener('popstate', this.onLocation)
    this.close()
  }

  protected shouldUpdate(changed: Map<string | number | symbol, unknown>) {
    if (this.content && changed.has('hass')) this.content.hass = this.hass
    // Only the head shows states of its own; the content updates itself
    if (changed.has('hass') && changed.size === 1) {
      const old = changed.get('hass') as HomeAssistant | undefined
      const id = this.shown?.entityId
      return !!id && old?.states[id] !== this.hass?.states[id]
    }
    return super.shouldUpdate(changed as never)
  }

  /** Opens the window for an entity, also from outside (the dev harness, a test) */
  open(entityId: string, target: MoreInfoTarget) {
    this.shown = { entityId, target }
    this.content = undefined
    const look = { theme: this.config?.theme, glass: this.config?.glass, primary_color: this.config?.primary_color, access: this.config?.access }
    if (target.kind === 'player') {
      const el = document.createElement('ad-music') as Content
      el.setConfig?.({ type: 'custom:ad-music', players: this.config?.players ?? [], solo: entityId, ...look })
      el.hass = this.hass
      this.content = el
      return
    }
    const load = loadHelpers()
    if (!load) return
    void load.then(h => {
      if (this.shown?.entityId !== entityId) return
      const el = h.createCardElement(target.card)
      el.hass = this.hass
      this.content = el
    })
  }

  close() {
    this.shown = undefined
    this.content = undefined
  }

  /** HA's own dialog after all, for what only it has (settings, history, related) */
  private native() {
    const entityId = this.shown?.entityId
    if (!entityId) return
    this.close()
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId, [NATIVE]: true }, bubbles: true, composed: true }))
  }

  static styles = [tokens, css`
    :host { position: fixed; inset: 0; z-index: 9; display: none; }
    :host([open]) { display: block; }
    .veil { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); animation: fade 0.2s ease both; }
    .sheet {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; height: auto;
      display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 16px; box-sizing: border-box;
      animation: rise 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    /* The player wants room for the cover beside the lyrics */
    .sheet.player { width: min(980px, calc(100vw - 24px)); }
    @keyframes fade { from { opacity: 0; } }
    @keyframes rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); } }
    @media (prefers-reduced-motion: reduce) { .veil, .sheet { animation: none; } }
    /* Phones: the window fills the screen from below, like HA's own dialog there */
    @media (max-width: 600px) {
      .sheet { left: 0; right: 0; bottom: 0; top: auto; transform: none; width: 100%; max-height: 92dvh; border-radius: 24px 24px 0 0; }
      .sheet.player { width: 100%; }
      @keyframes rise { from { opacity: 0; transform: translateY(24px); } }
    }
    header { display: flex; align-items: center; gap: 8px; }
    .title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .title span { font-size: var(--ad-fs-s); opacity: var(--ad-o2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title strong { font-size: var(--ad-fs-l); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .icon { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 50%; }
    .icon:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .close { background: rgba(var(--ad-on-surface), 0.08); }
    .loading { min-height: 160px; display: grid; place-items: center; opacity: var(--ad-o3); }
    /* A card from elsewhere sits in the window without a second surface around it */
    .card-slot { --ha-card-background: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; --ha-card-backdrop-filter: none; }
  `]

  protected updated() {
    this.toggleAttribute('open', !!this.shown)
  }

  protected render() {
    if (!this.shown || !this.hass) return nothing
    const { entityId, target } = this.shown
    const entity = this.hass.states[entityId]
    const name = entityName(entity, entityId)
    const area = this.hass.areas[entityAreaId(this.hass, entityId) ?? '']?.name
    return html`
      <div class="veil" @click=${() => this.close()}></div>
      <div class="sheet card ${target.kind}" role="dialog" aria-modal="true" aria-label=${name}>
        <header>
          <div class="title">${area ? html`<span>${area}</span>` : nothing}<strong>${name}</strong></div>
          <button class="icon" aria-label=${t(this.hass, 'mi.native')} title=${t(this.hass, 'mi.native')} @click=${() => this.native()}>
            <ha-icon icon="mdi:dots-vertical"></ha-icon></button>
          <button class="icon close" aria-label=${t(this.hass, 'popup.close')} @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
        </header>
        ${this.content ? html`<div class=${target.kind === 'card' ? 'card-slot' : 'player-slot'}>${this.content}</div>`
          : html`<div class="loading"><ha-icon icon="mdi:dots-horizontal"></ha-icon></div>`}
      </div>`
  }
}
