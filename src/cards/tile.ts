// One entity on a room or overview page. The tile shows the amount it controls as a material
// (see styles/materials.ts): a light is a dimmer you drag, a cover shows its slats, a thermostat sits on a scale.
// Switches and sensors are rows like a wall switch with a pilot light.
import { css, html, nothing } from 'lit'
import { BaseCard, gestures, type BaseConfig } from './base'
import { t } from '../i18n'
import { domainOf, entityIcon, entityName, hvacColor, isActive, isUnavailable, shortName, stateColor } from '../presentation'
import { materials } from '../styles/materials'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface TileConfig extends BaseConfig {
  entity: string
  /** Area name, stripped from the entity name when shown inside that area */
  area_name?: string
}

const LARGE = ['light', 'climate', 'cover', 'media_player', 'sensor']
const TOGGLES = ['light', 'switch', 'fan', 'input_boolean']

/** Pilot light color for a state color, as the r, g, b variable the materials use. */
const PILOT: Record<string, string> = {
  warning: 'var(--ad-warning)', error: 'var(--ad-error)', success: 'var(--ad-success)', info: 'var(--ad-info)', primary: 'var(--ad-primary)',
}

/** Pixels a pointer has to travel before a press becomes a drag (or a scroll). */
const DRAG_START = 8
/** Brightness step for the arrow keys. */
const KEY_STEP = 10

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export class AdTile extends BaseCard<TileConfig> {
  static properties = { ...BaseCard.properties, dragLevel: { state: true } }
  /** Brightness while dragging, and until HA reports the new value */
  dragLevel?: number
  private drag?: { x: number; y: number; start: number; width: number; active: boolean }
  private dragged = false
  private seen?: HassEntity

  static styles = [tokens, materials, css`
    /* Fill the grid rows HA reserves (getGridOptions), not just the content height */
    :host { display: block; height: 100%; }
    .card {
      padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px;
      cursor: pointer; user-select: none; -webkit-user-select: none;
    }
    .card:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    /* Content above the material layers */
    .top, .bottom, .big, .row-text, .row > ha-icon, .row > .pilot, .row > .btn { position: relative; z-index: 1; }
    .top { display: flex; align-items: flex-start; gap: 8px; }
    .name {
      flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.25; opacity: 0.85; letter-spacing: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .top .pilot { margin-top: 4px; }
    .bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; min-width: 0; }
    .big { font-size: 30px; font-weight: 300; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .big small { font-size: 14px; font-weight: 400; letter-spacing: 0; opacity: 0.6; margin-left: 2px; }
    .word { font-size: 15px; line-height: 1; opacity: 0.5; white-space: nowrap; }
    .ctl { display: flex; align-items: center; gap: 4px; }
    .btn { width: 30px; height: 30px; }
    .unavailable { opacity: 0.45; }

    /* Light: the whole tile is the dimmer, so vertical scrolling stays with the page */
    .light { touch-action: pan-y; }
    .light.dragging { cursor: ew-resize; }

    /* Thermostat */
    .mode { font-size: 12px; white-space: nowrap; opacity: 0.7; }
    .mode.warning { color: rgb(var(--ad-warning)); opacity: 1; }
    .mode.info { color: rgb(var(--ad-info)); opacity: 1; }
    .target { min-width: 34px; text-align: center; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
    /* Narrow tile: the reading on its own line, the target controls across the bottom above the scale */
    .climate { padding-bottom: 14px; gap: 2px; }
    .climate .big { font-size: 26px; }
    .climate .ctl { width: 100%; justify-content: space-between; }

    /* Media: the artwork is the tile */
    .media.art { color: #fff; }
    .media.art .btn { background: rgba(255, 255, 255, 0.18); color: #fff; }
    .title { font-size: 14px; font-weight: 600; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .artist { font-size: 12px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .media .bottom { align-items: center; }
    .media .now { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }

    /* Rows: like a wall switch, the whole row is the switch and the pilot light shows the state */
    .row { flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; padding: 0 16px 0 14px; }
    .row > ha-icon { --mdc-icon-size: 20px; opacity: 0.5; }
    .row.on > ha-icon { opacity: 1; color: rgb(var(--pilot, var(--ad-primary))); }
    .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .label { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 12px; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `]

  private tap = gestures({
    tap: () => this.onTap(),
    hold: () => this.moreInfo(this.config!.entity),
  })

  static getStubConfig() {
    return { entity: 'light.example' }
  }

  getGridOptions() {
    const large = LARGE.includes(domainOf(this.config?.entity ?? ''))
    // Rows take the full section width, so names have room
    return { columns: large ? 6 : 12, rows: large ? 2 : 1, min_rows: large ? 2 : 1 }
  }

  getCardSize() {
    return LARGE.includes(domainOf(this.config?.entity ?? '')) ? 2 : 1
  }

  protected watched() {
    return [this.config!.entity]
  }

  protected willUpdate() {
    super.willUpdate()
    // A new state from HA replaces the dragged preview
    const entity = this.entity
    if (entity !== this.seen) {
      if (this.seen && !this.drag) this.dragLevel = undefined
      this.seen = entity
    }
  }

  private get entity() {
    return this.state(this.config?.entity)
  }

  private get label() {
    return shortName(entityName(this.entity, this.config?.entity), this.config?.area_name)
  }

  private get controllable() {
    const e = this.entity
    return !!e && !isUnavailable(e) && this.canControl(e.entity_id)
  }

  /** Tap does the obvious thing (switch, run); everything else opens HA's details. Hold always opens them. */
  private onTap() {
    const entity = this.entity
    if (!entity || isUnavailable(entity)) return this.moreInfo(this.config!.entity)
    const domain = domainOf(entity.entity_id)
    if (this.controllable && [...TOGGLES, 'scene', 'script'].includes(domain)) this.toggle(entity)
    else this.moreInfo(entity.entity_id)
  }

  // Dimming by dragging across a light tile

  private dimmable(entity: HassEntity) {
    return (entity.attributes.supported_color_modes as string[] | undefined)?.some(m => m !== 'onoff') ?? false
  }

  private brightness(entity: HassEntity) {
    return entity.state === 'on' ? Math.round((entity.attributes.brightness ?? 255) / 2.55) : 0
  }

  private onDown(e: PointerEvent) {
    this.tap.down()
    const entity = this.entity
    if (!entity || domainOf(entity.entity_id) !== 'light' || !this.dimmable(entity) || !this.controllable) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    this.drag = { x: e.clientX, y: e.clientY, start: this.dragLevel ?? this.brightness(entity), width: rect.width, active: false }
  }

  private onMove(e: PointerEvent) {
    const drag = this.drag
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.active) {
      // Mostly vertical: the page scrolls, no dimming
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) return void (this.drag = undefined)
      if (Math.abs(dx) < DRAG_START) return
      drag.active = true
      this.tap.up()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    this.dragLevel = clamp(Math.round(drag.start + (dx / drag.width) * 100), 1, 100)
  }

  private onUp() {
    this.tap.up()
    if (this.drag?.active && this.dragLevel !== undefined) {
      this.dragged = true
      this.call('light', 'turn_on', this.config!.entity, { brightness_pct: this.dragLevel })
    }
    this.drag = undefined
  }

  private onClick() {
    // The click after a drag is not a tap
    if (this.dragged) return void (this.dragged = false)
    this.tap.click()
  }

  private onKey(e: KeyboardEvent) {
    const entity = this.entity
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      return this.onTap()
    }
    if (!entity || domainOf(entity.entity_id) !== 'light' || !this.dimmable(entity) || !this.controllable) return
    const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[e.key]
    if (!step) return
    e.preventDefault()
    this.dragLevel = clamp((this.dragLevel ?? this.brightness(entity)) + step, 1, 100)
    this.call('light', 'turn_on', entity.entity_id, { brightness_pct: this.dragLevel })
  }

  private wrap(classes: string, content: unknown, extra: { style?: string; label?: string } = {}) {
    return html`<div class="card ${classes}" role="button" tabindex="0" aria-label=${extra.label ?? this.label}
      style=${extra.style ?? ''}
      @pointerdown=${this.onDown} @pointermove=${this.onMove} @pointerup=${this.onUp}
      @pointerleave=${() => !this.drag?.active && this.tap.up()} @pointercancel=${this.onUp}
      @click=${this.onClick} @keydown=${this.onKey} @contextmenu=${(e: Event) => e.preventDefault()}
    >${content}</div>`
  }

  private stop = (e: Event) => e.stopPropagation()

  protected render() {
    const entity = this.entity
    if (!entity) {
      return this.wrap('row unavailable', html`<ha-icon icon="mdi:help-circle-outline"></ha-icon>
        <div class="row-text"><span class="label">${this.config!.entity}</span><span class="sub">${t(this.hass, 'unavailable')}</span></div>`)
    }
    const off = isUnavailable(entity) ? 'unavailable' : ''
    switch (domainOf(entity.entity_id)) {
      case 'light': return this.renderLight(entity, off)
      case 'climate': return this.renderClimate(entity, off)
      case 'cover': return this.renderCover(entity, off)
      case 'media_player': return this.renderMedia(entity, off)
      case 'sensor': return this.renderSensor(entity, off)
      default: return this.renderRow(entity, off)
    }
  }

  private renderLight(entity: HassEntity, off: string) {
    const on = entity.state === 'on'
    const dimmable = this.dimmable(entity)
    const level = this.dragLevel ?? (on ? (dimmable ? this.brightness(entity) : 100) : 0)
    const lit = level > 0
    const state = !lit ? t(this.hass, 'off') : dimmable ? `${level} %` : t(this.hass, 'on')
    return this.wrap(`light ${lit ? 'on' : ''} ${this.drag?.active ? 'dragging' : ''} ${off}`, html`
      ${lit ? html`<div class="light-fill" ?data-full=${level >= 100}></div>` : nothing}
      <div class="top">
        <span class="name">${this.label}</span>
        <span class="pilot ${lit ? 'on' : ''}" style="--pilot: var(--ad-warning)"></span>
      </div>
      <div class="bottom">
        ${lit && dimmable ? html`<span class="big">${level}<small>%</small></span>`
          : html`<span class="word">${lit ? t(this.hass, 'on') : t(this.hass, 'off')}</span>`}
      </div>
    `, {
      style: `--level:${level}%`,
      label: `${this.label}: ${state}${dimmable && this.controllable ? `. ${t(this.hass, 'dim_hint')}` : ''}`,
    })
  }

  private renderClimate(entity: HassEntity, off: string) {
    const a = entity.attributes
    const current = a.current_temperature as number | undefined
    const target = a.temperature as number | undefined
    const step = (a.target_temp_step as number | undefined) ?? 0.5
    const min = (a.min_temp as number | undefined) ?? 7
    const max = (a.max_temp as number | undefined) ?? 30
    const at = (v: number) => `${clamp(((v - min) / (max - min)) * 100, 0, 100)}%`
    const setTarget = (delta: number) => target !== undefined &&
      this.call('climate', 'set_temperature', entity.entity_id, { temperature: Math.round((target + delta) / step) * step })
    const action = (a.hvac_action as string | undefined) ?? entity.state
    const color = hvacColor(action === 'heating' ? 'heat' : action === 'cooling' ? 'cool' : entity.state)
    const ctl = this.controllable && target !== undefined
    return this.wrap(`climate ${off}`, html`
      <div class="top">
        <span class="name">${this.label}</span>
        <span class="mode ${color}">${this.hass!.formatEntityState?.(entity) ?? entity.state}</span>
      </div>
      <span class="big">${this.number(current)}<small>°</small></span>
      <div class="bottom">
        <div class="ctl" @click=${this.stop} @pointerdown=${this.stop}>
          ${ctl ? html`<button class="btn" aria-label="−" @click=${() => setTarget(-step)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
          <span class="target" title=${t(this.hass, 'target')}>${target !== undefined ? `${this.number(target, Number.isInteger(target) ? 0 : 1)}°` : '–'}</span>
          ${ctl ? html`<button class="btn" aria-label="+" @click=${() => setTarget(step)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
        </div>
      </div>
      ${current !== undefined ? html`<div class="scale" style="--now:${at(current)};--goal:${at(target ?? current)}">
        <span class="now"></span>${target !== undefined ? html`<span class="goal"></span>` : nothing}
      </div>` : nothing}
    `)
  }

  private renderCover(entity: HassEntity, off: string) {
    const open = isActive(entity)
    const position = (entity.attributes.current_position as number | undefined) ?? (open ? 100 : 0)
    const closed = 100 - position
    return this.wrap(`cover ${off}`, html`
      <div class="slats" style="--closed:${closed}%" data-closed=${closed}></div>
      <div class="top"><span class="name">${this.label}</span></div>
      <div class="bottom">
        <span class="big">${position}<small>%</small></span>
        ${this.controllable ? html`<div class="ctl" @click=${this.stop} @pointerdown=${this.stop}>
          <button class="btn" aria-label=${t(this.hass, 'all_open')} @click=${() => this.call('cover', 'open_cover', entity.entity_id)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="btn" aria-label="Stop" @click=${() => this.call('cover', 'stop_cover', entity.entity_id)}><ha-icon icon="mdi:stop"></ha-icon></button>
          <button class="btn" aria-label=${t(this.hass, 'all_close')} @click=${() => this.call('cover', 'close_cover', entity.entity_id)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        </div>` : nothing}
      </div>
    `, { label: `${this.label}: ${position} % ${t(this.hass, 'open').toLowerCase()}` })
  }

  private renderMedia(entity: HassEntity, off: string) {
    const playing = entity.state === 'playing'
    const picture = entity.attributes.entity_picture as string | undefined
    const title = entity.attributes.media_title as string | undefined
    const artist = (entity.attributes.media_artist ?? entity.attributes.app_name) as string | undefined
    const active = playing || entity.state === 'paused'
    const art = picture && active
    return this.wrap(`media ${art ? 'art' : ''} ${off}`, html`
      <div class="top">
        <span class="name">${this.label}</span>
        <span class="pilot ${playing ? 'on' : ''}"></span>
      </div>
      <div class="bottom">
        <div class="now">
          ${active ? html`<span class="title">${title ?? this.hass!.formatEntityState?.(entity) ?? entity.state}</span>
            ${artist ? html`<span class="artist">${artist}</span>` : nothing}`
            : html`<span class="word">${this.hass!.formatEntityState?.(entity) ?? entity.state}</span>`}
        </div>
        ${active && this.controllable ? html`<div class="ctl" @click=${this.stop} @pointerdown=${this.stop}>
          <button class="btn" aria-label="play/pause" @click=${() => this.call('media_player', 'media_play_pause', entity.entity_id)}><ha-icon icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon></button>
          <button class="btn" aria-label="next" @click=${() => this.call('media_player', 'media_next_track', entity.entity_id)}><ha-icon icon="mdi:skip-next"></ha-icon></button>
        </div>` : nothing}
      </div>
    `, {
      style: art ? `background: linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.25)), url('${picture}') center / cover no-repeat` : '',
    })
  }

  private renderSensor(entity: HassEntity, off: string) {
    const { value, unit } = this.value(entity)
    const level = unit === '%' ? Number(entity.state) : NaN
    return this.wrap(`sensor ${off}`, html`
      <div class="top"><span class="name">${this.label}</span></div>
      <div class="bottom"><span class="big">${value}${unit ? html`<small>${unit}</small>` : nothing}</span></div>
      ${Number.isFinite(level) ? html`<div class="level"><span style="--level:${clamp(level, 0, 100)}%"></span></div>` : nothing}
    `)
  }

  private renderRow(entity: HassEntity, off: string) {
    const domain = domainOf(entity.entity_id)
    const active = isActive(entity)
    const lock = domain === 'lock'
    // A lock always shows its pilot: green when locked, amber when open
    const color = lock ? (active ? 'success' : 'warning') : stateColor(entity, active)
    const lit = lock || active
    const runnable = domain === 'scene' || domain === 'script'
    return this.wrap(`row ${lit ? 'on' : ''} ${off}`, html`
      <ha-icon icon=${this.hass!.entities[entity.entity_id]?.icon ?? entityIcon(entity, active)}></ha-icon>
      <div class="row-text">
        <span class="label">${this.label}</span>
        ${runnable ? nothing : html`<span class="sub">${this.hass!.formatEntityState?.(entity) ?? entity.state}</span>`}
      </div>
      ${lock && this.controllable ? html`<button class="btn" aria-label=${t(this.hass, active ? 'do_unlock' : 'do_lock')} title=${t(this.hass, active ? 'do_unlock' : 'do_lock')}
        @pointerdown=${this.stop} @click=${(e: Event) => { e.stopPropagation(); this.toggle(entity) }}>
        <ha-icon icon=${active ? 'mdi:lock-open-variant-outline' : 'mdi:lock'}></ha-icon></button>` : nothing}
      ${runnable ? nothing : html`<span class="pilot ${lit ? 'on' : ''}" style="--pilot: ${PILOT[color] ?? 'var(--ad-primary)'}"></span>`}
    `, { style: `--pilot: ${PILOT[color] ?? 'var(--ad-primary)'}` })
  }
}
