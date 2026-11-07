// The lists page: every to-do list as HA's own list card under a head of ours, with the name, what is still
// open and a chevron to fold it away. Admins can add a list (a new Local To-do entry) and delete local lists.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { domainOf, entityName } from '../presentation'
import { allEntities, hideOf, type HideOptions } from '../model'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface ListsCardConfig extends BaseConfig, HideOptions {
  /** Picked lists in their order; unset = every visible list, new ones included */
  entities?: string[]
}

interface FlowStep { type: string; flow_id: string; reason?: string; errors?: Record<string, string> }

const FOLDED_KEY = 'ad-lists-folded'
/** Lists from the Local To-do integration; only those can be deleted on their own */
const LOCAL = 'local_todo'

type CardHelpers = { createCardElement(config: object): HTMLElement & { hass?: unknown } }
let helpers: Promise<CardHelpers> | undefined
const loadHelpers = () => {
  const load = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers
  return load ? (helpers ??= load()) : undefined
}

function readFolded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

export class AdLists extends BaseCard<ListsCardConfig> {
  static properties = {
    ...BaseCard.properties,
    folded: { state: true },
    creating: { state: true },
    newName: { state: true },
    confirming: { state: true },
    busy: { state: true },
    error: { state: true },
  }

  folded = readFolded()
  creating = false
  newName = ''
  confirming?: string
  busy = false
  error?: string
  private cards = new Map<string, HTMLElement & { hass?: unknown }>()

  static styles = [tokens, css`
    :host { display: block; }
    .bar { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-bottom: 12px; min-height: 36px; }
    .bar .error { margin-right: auto; }
    .lists { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 16px; align-items: start; }
    .card { height: auto; }

    .head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 0; }
    .fold {
      all: unset; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 20px; cursor: pointer; border-radius: 16px;
    }
    .fold:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .fold ha-icon { --mdc-icon-size: 22px; opacity: 0.55; transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1); }
    .folded .fold ha-icon { transform: rotate(-90deg); }
    .text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .title { font-size: 17px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .open { font-size: 12px; opacity: 0.55; font-variant-numeric: tabular-nums; }
    .head .btn { flex: none; background: transparent; color: rgba(var(--ad-on-surface), 0.55); }
    .head .btn:hover { background: rgba(var(--ad-on-surface), 0.08); }

    /* HA's card sits inside ours without a surface of its own */
    .body {
      --ha-card-background: transparent; --card-background-color: transparent; --ha-card-backdrop-filter: none;
      --ha-card-box-shadow: none; --ha-card-border-width: 0; --ha-card-border-radius: 0;
      margin-top: -8px;
    }
    .folded .body { display: none; }
    .placeholder { padding: 0 20px 20px; font-size: 13px; opacity: 0.55; }

    .confirm { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 0 20px 16px; font-size: 14px; }
    .confirm span { flex: 1 1 100%; margin-bottom: 4px; }
    .new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 16px; }
    .new input {
      flex: 1 1 200px; box-sizing: border-box; min-width: 0; padding: 10px 12px; border: none; border-radius: 10px; font: inherit; font-size: 15px;
      color: inherit; background: rgba(var(--ad-on-surface), 0.06);
    }
    .new input:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 0; }
    .empty { padding: 24px 20px; font-size: 14px; opacity: 0.65; }

    .act {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px; border-radius: 18px;
      font-size: 13px; font-weight: 500; background: rgba(var(--ad-on-surface), 0.08);
    }
    .act ha-icon { --mdc-icon-size: 18px; }
    .act:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .act.primary { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .act.danger { background: rgba(var(--ad-error), 0.16); color: rgb(var(--ad-error)); }
    .act[disabled] { opacity: 0.5; pointer-events: none; }
    .error { margin: 0; font-size: 13px; color: rgb(var(--ad-error)); }

    @media (prefers-reduced-motion: reduce) {
      .fold ha-icon { transition: none; }
    }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 8
  }

  protected watched() {
    return this.lists().map(e => e.entity_id)
  }

  /** The picked lists, or every visible one, so a list added here shows up at once */
  private lists(): HassEntity[] {
    const hass = this.hass
    if (!hass) return []
    const picked = this.config?.entities
    if (picked?.length) return picked.map(id => hass.states[id]).filter((e): e is HassEntity => !!e)
    return allEntities(hass, hideOf(this.config ?? {})).filter(e => domainOf(e.entity_id) === 'todo')
  }

  private get admin() {
    return !!this.hass?.user?.is_admin && !!this.hass.callApi && !!this.hass.callWS
  }

  private deletable(id: string) {
    return this.admin && this.hass?.entities[id]?.platform === LOCAL
  }

  private fold(id: string) {
    const folded = new Set(this.folded)
    if (!folded.delete(id)) folded.add(id)
    this.folded = folded
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded])) } catch { /* private mode: only this visit */ }
  }

  /** HA's list card for one list, made once and kept; undefined while HA loads it, null without HA (the harness) */
  private cardFor(id: string): (HTMLElement & { hass?: unknown }) | null | undefined {
    const card = this.cards.get(id)
    if (card) {
      card.hass = this.hass
      return card
    }
    const load = loadHelpers()
    if (!load) return null
    void load.then(h => {
      if (this.cards.has(id)) return
      const el = h.createCardElement({ type: 'todo-list', entity: id })
      el.hass = this.hass
      this.cards.set(id, el)
      this.requestUpdate()
    })
    return undefined
  }

  private failed(err: unknown) {
    const msg = (err as { message?: string; body?: { message?: string } })?.body?.message ?? (err as { message?: string })?.message ?? String(err)
    this.error = t(this.hass, 'lists.failed', { msg })
  }

  private async create() {
    const name = this.newName.trim()
    if (!name || this.busy) return
    this.busy = true
    this.error = undefined
    const api = this.hass!.callApi!
    try {
      const flow = await api<FlowStep>('POST', 'config/config_entries/flow', { handler: LOCAL, show_advanced_options: false })
      const done = flow.type === 'form' ? await api<FlowStep>('POST', `config/config_entries/flow/${flow.flow_id}`, { todo_list_name: name }) : flow
      if (done.type !== 'create_entry') {
        this.error = done.reason === 'already_configured' ? t(this.hass, 'lists.exists') : t(this.hass, 'lists.failed', { msg: done.reason ?? Object.values(done.errors ?? {}).join(', ') })
        return
      }
      this.creating = false
      this.newName = ''
    } catch (err) {
      this.failed(err)
    } finally {
      this.busy = false
    }
  }

  private async deleteList(id: string) {
    if (this.busy) return
    this.busy = true
    this.error = undefined
    try {
      const entry = await this.hass!.callWS!<{ config_entry_id?: string }>({ type: 'config/entity_registry/get', entity_id: id })
      if (!entry.config_entry_id) throw new Error(id)
      await this.hass!.callWS!({ type: 'config_entries/delete', entry_id: entry.config_entry_id })
      this.confirming = undefined
      this.cards.delete(id)
    } catch (err) {
      this.failed(err)
    } finally {
      this.busy = false
    }
  }

  protected updated(changed: Map<string, unknown>) {
    // autofocus does not reach into a shadow root that renders later
    if (changed.has('creating') && this.creating) this.renderRoot.querySelector<HTMLInputElement>('.new input')?.focus()
  }

  private renderNew() {
    const hass = this.hass!
    return html`<div class="card new">
      <input placeholder=${t(hass, 'lists.name')} aria-label=${t(hass, 'lists.name')} .value=${this.newName}
        @input=${(ev: Event) => { this.newName = (ev.target as HTMLInputElement).value }}
        @keydown=${(ev: KeyboardEvent) => { if (ev.key === 'Enter') void this.create(); if (ev.key === 'Escape') this.creating = false }}>
      <button class="act" @click=${() => { this.creating = false; this.newName = ''; this.error = undefined }}>${t(hass, 'cal.cancel')}</button>
      <button class="act primary" ?disabled=${!this.newName.trim() || this.busy} @click=${() => this.create()}>${t(hass, 'lists.create')}</button>
    </div>`
  }

  private renderList(e: HassEntity) {
    const hass = this.hass!
    const id = e.entity_id
    const folded = this.folded.has(id)
    const name = entityName(e)
    const open = Number(e.state)
    const count = Number.isFinite(open) ? (open ? t(hass, 'lists.open', { n: open }) : t(hass, 'lists.done')) : ''
    const card = folded ? undefined : this.cardFor(id)
    return html`<div class="card ${folded ? 'folded' : ''}">
      <div class="head">
        <button class="fold" aria-expanded=${!folded} @click=${() => this.fold(id)}>
          <ha-icon icon="mdi:chevron-down"></ha-icon>
          <span class="text"><span class="title">${name}</span>${count ? html`<span class="open">${count}</span>` : nothing}</span>
        </button>
        ${this.deletable(id) && this.confirming !== id ? html`<button class="btn" aria-label=${t(hass, 'lists.delete')} title=${t(hass, 'lists.delete')}
          @click=${() => { this.confirming = id; this.error = undefined }}><ha-icon icon="mdi:delete-outline"></ha-icon></button>` : nothing}
      </div>
      ${this.confirming === id ? html`<div class="confirm" role="alertdialog">
        <span>${t(hass, 'lists.confirm_delete', { name })}</span>
        <button class="act" @click=${() => { this.confirming = undefined }}>${t(hass, 'cal.cancel')}</button>
        <button class="act danger" ?disabled=${this.busy} @click=${() => this.deleteList(id)}>${t(hass, 'lists.delete')}</button>
      </div>` : nothing}
      ${folded ? nothing : html`<div class="body">${card === null ? html`<div class="placeholder">todo-list: ${id}</div>` : card ?? nothing}</div>`}
    </div>`
  }

  protected render() {
    const hass = this.hass!
    const lists = this.lists()
    // A fixed pick would hide a new list, so adding is only offered when every list shows
    const canCreate = this.admin && !this.config!.entities?.length
    const error = this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing
    return html`
      ${canCreate || this.error ? html`<div class="bar">
        ${error}
        ${canCreate && !this.creating ? html`<button class="act" @click=${() => { this.creating = true; this.error = undefined }}>
          <ha-icon icon="mdi:plus"></ha-icon>${t(hass, 'lists.new')}</button>` : nothing}
      </div>` : nothing}
      <div class="lists">
        ${this.creating ? this.renderNew() : nothing}
        ${lists.map(e => this.renderList(e))}
        ${!lists.length && !this.creating ? html`<div class="card empty">${t(hass, 'lists.none')}</div>` : nothing}
      </div>`
  }
}
