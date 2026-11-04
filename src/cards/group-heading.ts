// Heading above a group of tiles (a room on a domain page, a group on a room page) with one control for all of them:
// a switch with "2/5" for lights and switches, up/down for covers, lock/unlock for locks.
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
}

export class AdGroupHeading extends BaseCard<GroupHeadingConfig> {
  static styles = [tokens, css`
    :host { display: block; }
    .wrap { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 4px 0; }
    .title {
      all: unset; display: inline-flex; align-items: center; gap: 8px; min-width: 0;
      font-size: 18px; font-weight: 500; letter-spacing: -0.01em;
    }
    .sub .title { font-size: 14px; font-weight: 500; opacity: 0.8; }
    .title[role=link] { cursor: pointer; }
    .title[role=link]:hover .chev { opacity: 0.6; }
    .title ha-icon { --mdc-icon-size: 20px; opacity: 0.55; }
    .sub .title ha-icon { --mdc-icon-size: 17px; }
    .chev { --mdc-icon-size: 16px !important; opacity: 0.3; transition: opacity 0.2s ease; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fill { flex: 1; }
    .count { font-size: 12px; opacity: 0.55; white-space: nowrap; }
    .ctl { display: flex; align-items: center; gap: 6px; }
    .btn { width: 30px; height: 30px; }
    .switch {
      all: unset; position: relative; flex: 0 0 auto; width: 36px; height: 20px; border-radius: 10px; cursor: pointer;
      background: rgba(var(--ad-on-surface), 0.18); transition: background 0.25s ease;
    }
    .switch::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform 0.25s ease;
    }
    .switch[aria-checked=true] { background: rgb(var(--ad-warning)); }
    .switch[aria-checked=true]::after { transform: translateX(16px); }
    .switch:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
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

  private renderControl(entities: HassEntity[]) {
    const ids = entities.map(e => e.entity_id)
    if (!this.config!.control || !canBulk(this.config!.access, ids) || ids.some(id => !this.canControl(id))) return nothing
    switch (this.config!.control) {
      case 'toggle': {
        const on = entities.filter(e => e.state === 'on')
        // Something on: switch those off. All off: switch everything on.
        return html`<div class="ctl"><button class="switch" role="switch" aria-checked=${on.length > 0} aria-label=${this.config!.title}
          @click=${() => this.call('homeassistant', on.length ? 'turn_off' : 'turn_on', on.length ? on.map(e => e.entity_id) : ids)}></button></div>`
      }
      case 'cover':
        return html`<div class="ctl">
          <button class="btn" aria-label=${t(this.hass, 'all_open')} title=${t(this.hass, 'all_open')} @click=${() => this.call('cover', 'open_cover', ids)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="btn" aria-label=${t(this.hass, 'all_close')} title=${t(this.hass, 'all_close')} @click=${() => this.call('cover', 'close_cover', ids)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        </div>`
      case 'lock':
        return html`<div class="ctl">
          <button class="btn" aria-label=${t(this.hass, 'lock_all')} title=${t(this.hass, 'lock_all')} @click=${() => this.call('lock', 'lock', ids)}><ha-icon icon="mdi:lock"></ha-icon></button>
          <button class="btn" aria-label=${t(this.hass, 'unlock_all')} title=${t(this.hass, 'unlock_all')} @click=${() => this.unlockAll(entities)}><ha-icon icon="mdi:lock-open-variant-outline"></ha-icon></button>
        </div>`
    }
  }

  private countText(entities: HassEntity[]) {
    const c = this.config!
    if (!c.control || entities.length < 2) return undefined
    if (c.control === 'toggle') return `${entities.filter(e => e.state === 'on').length}/${entities.length}`
    if (c.control === 'cover') return t(this.hass, 'n_open', { n: entities.filter(e => isActive(e)).length })
    return t(this.hass, 'n_open', { n: entities.filter(e => !isActive(e)).length })
  }

  protected render() {
    const c = this.config!
    const entities = this.entities
    const count = this.countText(entities)
    return html`<div class="wrap ${c.sub ? 'sub' : ''}">
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
