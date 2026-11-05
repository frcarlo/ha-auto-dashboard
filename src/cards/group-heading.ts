// Heading above a group of tiles (a room on a domain page, a group on a room page) with one control for all of them:
// a switch with "2/5" for lights and switches, up/down for covers, out/in for awnings, lock/unlock for locks.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { canBulk } from '../access'
import { isActive, isUnavailable } from '../presentation'
import { tokens } from '../styles/tokens'
import type { GroupControl } from '../model'
import type { HassEntity } from '../types'

interface GroupHeadingConfig extends BaseConfig {
  title: string
  icon?: string
  /** View path the title links to (a room page) */
  path?: string
  entities: string[]
  control?: GroupControl
  /** Smaller heading for rooms inside a floor section */
  sub?: boolean
  /** Smallest: one kind within a room, e.g. its awnings next to its blinds */
  minor?: boolean
}

export class AdGroupHeading extends BaseCard<GroupHeadingConfig> {
  static styles = [tokens, css`
    :host { display: block; }
    .wrap { display: flex; align-items: baseline; gap: 10px; min-height: 40px; padding: 10px 4px 2px; }
    .title {
      all: unset; display: inline-flex; align-items: baseline; gap: 6px; min-width: 0;
      font-size: 17px; font-weight: 500;
    }
    .sub .title { font-size: 15px; }
    .minor { min-height: 32px; padding-top: 2px; }
    .minor .title { font-size: 13px; font-weight: 500; opacity: 0.75; }
    .title[role=link] { cursor: pointer; }
    .title[role=link]:hover .name { text-decoration: underline; text-underline-offset: 3px; }
    .title:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 3px; border-radius: 4px; }
    .title ha-icon { --mdc-icon-size: 18px; opacity: 0.5; align-self: center; }
    .chev { --mdc-icon-size: 16px !important; opacity: 0.35; }
    /* The shared .name style is the small tile caption; a heading takes its size from .title */
    .title .name { font-size: inherit; opacity: 1; letter-spacing: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .count { font-size: 13px; opacity: 0.55; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .fill { flex: 1; }
    .ctl { display: flex; align-items: center; gap: 4px; align-self: center; }
    /* Bulk actions are words, so it is clear what happens to the whole group */
    .act {
      all: unset; cursor: pointer; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 500; white-space: nowrap;
      background: rgba(var(--ad-on-surface), 0.07);
    }
    .act:hover { background: rgba(var(--ad-on-surface), 0.12); }
    .act:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  protected watched() {
    return this.config!.entities
  }

  private get entities() {
    return this.config!.entities.map(id => this.hass!.states[id]).filter((e): e is HassEntity => !!e && !isUnavailable(e))
  }

  private unlockAll(locks: HassEntity[]) {
    // Unlocking a whole room is the one bulk action that always asks first
    if (!confirm(t(this.hass, 'confirm_unlock', { n: locks.length }))) return
    this.call('lock', 'unlock', locks.map(e => e.entity_id))
  }

  private act(label: string, onClick: () => void) {
    return html`<button class="act" @click=${onClick}>${label}</button>`
  }

  private renderControl(entities: HassEntity[]) {
    const ids = entities.map(e => e.entity_id)
    if (!this.config!.control || !canBulk(this.config!.access, ids) || ids.some(id => !this.canControl(id))) return nothing
    switch (this.config!.control) {
      case 'toggle': {
        const on = entities.filter(e => e.state === 'on')
        // Something on: switch those off. All off: switch everything on.
        return html`<div class="ctl">${on.length
          ? this.act(t(this.hass, 'all_off'), () => this.call('homeassistant', 'turn_off', on.map(e => e.entity_id)))
          : this.act(t(this.hass, 'all_on'), () => this.call('homeassistant', 'turn_on', ids))}</div>`
      }
      case 'cover':
        return html`<div class="ctl">
          ${this.act(t(this.hass, 'act_up'), () => this.call('cover', 'open_cover', ids))}
          ${this.act(t(this.hass, 'act_down'), () => this.call('cover', 'close_cover', ids))}
        </div>`
      case 'awning':
        return html`<div class="ctl">
          ${this.act(t(this.hass, 'extend'), () => this.call('cover', 'open_cover', ids))}
          ${this.act(t(this.hass, 'retract'), () => this.call('cover', 'close_cover', ids))}
        </div>`
      case 'lock':
        return html`<div class="ctl">
          ${this.act(t(this.hass, 'do_lock'), () => this.call('lock', 'lock', ids))}
          ${this.act(t(this.hass, 'do_unlock'), () => this.unlockAll(entities))}
        </div>`
    }
  }

  private countText(entities: HassEntity[]) {
    const c = this.config!
    if (!c.control || entities.length < 2) return undefined
    if (c.control === 'toggle') return t(this.hass, 'n_of_on', { n: entities.filter(e => e.state === 'on').length, total: entities.length })
    if (c.control === 'cover') return t(this.hass, 'n_open', { n: entities.filter(e => isActive(e)).length })
    if (c.control === 'awning') return t(this.hass, 'n_out', { n: entities.filter(e => isActive(e)).length })
    return t(this.hass, 'n_open', { n: entities.filter(e => !isActive(e)).length })
  }

  protected render() {
    const c = this.config!
    const entities = this.entities
    const count = this.countText(entities)
    return html`<div class="wrap ${c.sub ? 'sub' : ''} ${c.minor ? 'minor' : ''}">
      <span class="title" role=${c.path ? 'link' : nothing} tabindex=${c.path ? '0' : nothing}
        @click=${() => c.path && this.navigate(c.path)}
        @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && c.path && this.navigate(c.path)}>
        ${c.icon ? html`<ha-icon icon=${c.icon}></ha-icon>` : nothing}
        <span class="name">${c.title}</span>
        ${c.path ? html`<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>` : nothing}
      </span>
      <span class="fill"></span>
      ${count ? html`<span class="count">${count}</span>` : nothing}
      ${this.renderControl(entities)}
    </div>`
  }
}
