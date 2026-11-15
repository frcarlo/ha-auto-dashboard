// Printers on the maintenance page: one block per printer with its cartridges as small tanks in their own
// color, the wear parts as thin bars below, and what the printer is doing or what stops it.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import { printers, type Consumable, type Printer } from '../printers'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface PrintersConfig extends BaseConfig {
  areas?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

export class AdPrinters extends BaseCard<PrintersConfig> {
  static styles = [tokens, css`
    :host { display: block; }
    .card { padding: 6px; display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: start; }
    .printer { padding: 10px 10px 12px; border-radius: 18px; background: rgba(var(--ad-on-surface), 0.035); display: flex; flex-direction: column; gap: 12px; }
    .head { all: unset; display: flex; align-items: center; gap: 10px; cursor: pointer; border-radius: 12px; }
    .head:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .head > ha-icon { --mdc-icon-size: 20px; opacity: var(--ad-o2); }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .name { font-size: var(--ad-fs-s); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: var(--ad-fs-xs); opacity: var(--ad-o3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .state { font-size: var(--ad-fs-xs); padding: 3px 8px; border-radius: 999px; background: rgba(var(--ad-on-surface), 0.07); white-space: nowrap; }
    .state.busy { background: rgba(var(--ad-primary), 0.16); color: rgb(var(--ad-primary)); }
    .problems { display: flex; flex-wrap: wrap; gap: 6px; }
    .problem { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: var(--ad-fs-xs); font-weight: 600; padding: 4px 9px; border-radius: 999px;
      color: rgb(var(--ad-error)); background: rgba(var(--ad-error), 0.12); }
    .problem ha-icon { --mdc-icon-size: 14px; }

    /* Cartridges: a tank per color, filled from the bottom */
    .tanks { display: flex; gap: 10px; padding: 0 2px; }
    .tank { all: unset; cursor: pointer; flex: 1; max-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 6px; border-radius: 10px; }
    .tank:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .glass { position: relative; width: 100%; height: 72px; border-radius: 10px; overflow: hidden;
      background: rgba(var(--ad-on-surface), 0.07); box-shadow: inset 0 0 0 1px rgba(var(--ad-on-surface), 0.06); }
    .fill { position: absolute; inset: auto 0 0 0; background: var(--ink); transition: height 0.6s ease; }
    .fill::after { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: rgba(255, 255, 255, 0.35); }
    .low .glass { box-shadow: inset 0 0 0 2px rgb(var(--ad-error)); }
    .pct { font-size: var(--ad-fs-s); font-variant-numeric: tabular-nums; font-weight: 600; }
    .low .pct { color: rgb(var(--ad-error)); }
    .label { font-size: var(--ad-fs-xs); opacity: var(--ad-o3); margin-top: -4px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Wear parts: drums, belt, fuser */
    .parts { display: flex; flex-direction: column; gap: 2px; }
    .part { all: unset; cursor: pointer; display: grid; grid-template-columns: 10px minmax(0, 1fr) 72px 38px; align-items: center; gap: 8px; padding: 4px 4px; border-radius: 8px; font-size: var(--ad-fs-xs); }
    .part:hover, .tank:hover .glass { background-color: rgba(var(--ad-on-surface), 0.1); }
    .part:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink); }
    .part .n { opacity: var(--ad-o2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar { height: 4px; border-radius: 2px; background: rgba(var(--ad-on-surface), 0.1); overflow: hidden; }
    .bar i { display: block; height: 100%; background: rgba(var(--ad-on-surface), 0.55); border-radius: 2px; }
    .part .v { text-align: end; font-variant-numeric: tabular-nums; opacity: var(--ad-o2); }
    .part.low .bar i { background: rgb(var(--ad-error)); }
    .part.low .v { color: rgb(var(--ad-error)); opacity: 1; font-weight: 600; }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  `]

  private ids: string[] = []

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 4
  }

  protected watched() {
    return this.ids
  }

  /** Ink in its own color; black in the text color, so it shows on a dark page too */
  private ink(c: Consumable) {
    return { black: 'rgb(var(--ad-on-surface))', cyan: '#06b6d4', magenta: '#d946ef', yellow: '#facc15', other: 'rgb(var(--ad-primary))' }[c.color]
  }

  /** An entity's name without the printer's in front: "Cyan-Toner" from "Drucker Cyan-Toner" */
  private own(e: HassEntity, p: Printer) {
    const name = String(e.attributes.friendly_name ?? e.entity_id)
    return name.startsWith(`${p.name} `) ? name.slice(p.name.length + 1) : name
  }

  private label(c: Consumable, p: Printer) {
    return c.color === 'other' ? this.own(c.entity, p) : t(this.hass, `printer.${c.color}` as Key)
  }

  private partName(c: Consumable, p: Printer) {
    const short = this.own(c.entity, p)
    // Brother's "Lebensdauer Cyan-Trommel" says more than it needs to
    return short.replace(/^(rest)?lebensdauer (der |des )?/i, '').replace(/^(remaining life|life) (of )?/i, '') || short
  }

  private renderPrinter(p: Printer) {
    const area = this.hass!.areas[p.areaId ?? '']?.name
    const status = p.status
    const busy = status && /print|druck|processing/i.test(status.state)
    const head = status ?? p.supplies[0]?.entity
    const pct = (c: Consumable) => `${Math.round(c.level)} %`
    return html`<div class="printer">
      <button class="head" @click=${() => head && this.moreInfo(head.entity_id)}>
        <ha-icon icon="mdi:printer-outline"></ha-icon>
        <span class="text"><span class="name">${p.name}</span><span class="sub">${[p.model && p.model !== p.name ? p.model : '', area].filter(Boolean).join(' · ')}</span></span>
        ${status && !['unknown', 'unavailable'].includes(status.state)
          ? html`<span class="state ${busy ? 'busy' : ''}">${this.hass!.formatEntityState?.(status) ?? status.state}</span>` : nothing}
      </button>
      ${p.problems.length ? html`<div class="problems">${p.problems.map(e => html`<button class="problem" @click=${() => this.moreInfo(e.entity_id)}>
        <ha-icon icon="mdi:alert-circle"></ha-icon>${this.own(e, p)}</button>`)}</div>` : nothing}
      ${p.supplies.length ? html`<div class="tanks">${p.supplies.map(c => html`<button class="tank ${c.level <= c.low ? 'low' : ''}" style="--ink:${this.ink(c)}"
        aria-label="${this.label(c, p)} ${pct(c)}" @click=${() => this.moreInfo(c.entity.entity_id)}>
        <span class="glass"><span class="fill" style="height:${Math.max(0, Math.min(100, c.level))}%"></span></span>
        <span class="pct">${pct(c)}</span><span class="label">${this.label(c, p)}</span>
      </button>`)}</div>` : nothing}
      ${p.parts.length ? html`<div class="parts">${p.parts.map(c => html`<button class="part ${c.level <= c.low ? 'low' : ''}" style="--ink:${c.color === 'other' ? 'transparent' : this.ink(c)}"
        @click=${() => this.moreInfo(c.entity.entity_id)}>
        <span class="dot"></span><span class="n">${this.partName(c, p)}</span><span class="bar"><i style="width:${Math.max(0, Math.min(100, c.level))}%"></i></span><span class="v">${pct(c)}</span>
      </button>`)}</div>` : nothing}
    </div>`
  }

  protected render() {
    const { areas, hide_labels, hide_entities } = this.config!
    const list = printers(this.hass!, areas, hide_labels, hide_entities)
    this.ids = list.flatMap(p => [...p.supplies, ...p.parts].map(c => c.entity.entity_id).concat(p.status ? [p.status.entity_id] : [],
      Object.values(this.hass!.states).filter(e => this.hass!.entities[e.entity_id]?.device_id === p.deviceId && e.entity_id.startsWith('binary_sensor.')).map(e => e.entity_id)))
    if (!list.length) return nothing
    return html`<div class="card">${list.map(p => this.renderPrinter(p))}</div>`
  }
}
