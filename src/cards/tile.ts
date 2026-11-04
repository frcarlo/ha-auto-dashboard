import { css, html, nothing } from 'lit'
import { BaseCard, gestures, type BaseConfig } from './base'
import { t } from '../i18n'
import { HVAC_ICONS, domainOf, entityIcon, entityName, hvacColor, isActive, isUnavailable, shortName, stateColor } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface TileConfig extends BaseConfig {
  entity: string
  /** Area name, stripped from the entity name when shown inside that area */
  area_name?: string
}

const LARGE = ['light', 'climate', 'cover', 'media_player', 'sensor']

export class AdTile extends BaseCard<TileConfig> {
  static styles = [tokens, css`
    /* Fill the grid rows HA reserves (getGridOptions), not just the content height */
    :host { display: block; height: 100%; }
    .card { padding: 12px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; user-select: none; }
    .head { display: flex; align-items: center; gap: 6px; position: relative; z-index: 1; }
    .head > ha-icon { --mdc-icon-size: 13px; opacity: 0.45; }
    .head .name { flex: 1; }
    .body { flex: 1; display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; min-width: 0; }
    .body .big { flex: 1; text-align: right; }
    .row { display: flex; align-items: center; gap: 8px; position: relative; z-index: 1; }
    .row.end { justify-content: flex-end; }
    .sub { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Light: warm glow from the top and a breathing bulb */
    .glow { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: background 0.6s ease; }
    .light-on .glow { background: radial-gradient(ellipse 120% 90% at 50% 0%, rgba(var(--ad-warning), 0.40) 0%, transparent 72%); }
    .bulb { --mdc-icon-size: 34px; opacity: 0.2; transition: opacity 0.4s ease; }
    .light-on .bulb { opacity: 1; color: rgb(var(--ad-warning)); animation: pulse 3.2s ease-in-out infinite; }
    @keyframes pulse {
      0%, 100% { filter: drop-shadow(0 0 8px rgba(var(--ad-warning), 0.5)); }
      50% { filter: drop-shadow(0 0 16px rgba(var(--ad-warning), 0.8)); }
    }
    @media (prefers-reduced-motion: reduce) { .light-on .bulb { animation: none; } }

    input[type=range] {
      flex: 1; min-width: 0; height: 4px; margin: 0; appearance: none; -webkit-appearance: none; cursor: pointer;
      border-radius: 2px; background: rgba(var(--ad-on-surface), 0.12);
      background-image: linear-gradient(rgb(var(--ad-warning)), rgb(var(--ad-warning)));
      background-size: var(--pct, 0%) 100%; background-repeat: no-repeat;
    }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
    .light-off input[type=range] { opacity: 0.4; }
    input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); }

    .switch {
      all: unset; position: relative; flex: 0 0 auto; width: 36px; height: 20px; border-radius: 10px; cursor: pointer;
      background: rgba(var(--ad-on-surface), 0.18); transition: background 0.25s ease;
    }
    .switch::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform 0.25s ease;
    }
    .switch[aria-checked=true] { background: rgb(var(--accent, var(--ad-primary))); }
    .switch[aria-checked=true]::after { transform: translateX(16px); }
    .switch:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }

    /* Compact one-row tile */
    .compact { flex-direction: row; align-items: center; padding: 0 12px; gap: 10px; }
    .compact .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .compact .label { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .art { width: 44px; height: 44px; border-radius: 12px; background: center / cover rgba(var(--ad-on-surface), 0.08); flex: 0 0 auto; display: grid; place-items: center; }
    .art ha-icon { opacity: 0.4; }
    .media .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .unavailable { opacity: 0.45; }
    .target { flex: 1; text-align: center; font-size: 13px; font-weight: 500; }
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
    // Compact rows take the full section width, so names have room
    return { columns: large ? 6 : 12, rows: large ? 2 : 1, min_rows: large ? 2 : 1 }
  }

  getCardSize() {
    return LARGE.includes(domainOf(this.config?.entity ?? '')) ? 2 : 1
  }

  protected watched() {
    return [this.config!.entity]
  }

  private get entity() {
    return this.state(this.config?.entity)
  }

  private get label() {
    return shortName(entityName(this.entity, this.config?.entity), this.config?.area_name)
  }

  /** Tap toggles what is cheap to toggle; everything else opens HA's more-info. Hold always opens more-info. */
  private onTap() {
    const entity = this.entity
    if (!entity || isUnavailable(entity)) return this.moreInfo(this.config!.entity)
    const domain = domainOf(entity.entity_id)
    if (this.canControl(entity.entity_id) && ['light', 'switch', 'fan', 'input_boolean', 'scene', 'script'].includes(domain)) this.toggle(entity)
    else this.moreInfo(entity.entity_id)
  }

  private wrap(classes: string, content: unknown) {
    return html`<div
      class="card ${classes}"
      role="button"
      tabindex="0"
      aria-label=${this.label}
      @pointerdown=${this.tap.down}
      @pointerup=${this.tap.up}
      @pointerleave=${this.tap.up}
      @pointercancel=${this.tap.up}
      @click=${this.tap.click}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.onTap()}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >${content}</div>`
  }

  protected render() {
    const entity = this.entity
    if (!entity) return this.wrap('compact unavailable', html`<ha-icon icon="mdi:help-circle-outline"></ha-icon><div class="text"><span class="label">${this.config!.entity}</span><span class="sub">${t(this.hass, 'unavailable')}</span></div>`)
    const off = isUnavailable(entity) ? 'unavailable' : ''
    switch (domainOf(entity.entity_id)) {
      case 'light': return this.renderLight(entity, off)
      case 'climate': return this.renderClimate(entity, off)
      case 'cover': return this.renderCover(entity, off)
      case 'media_player': return this.renderMedia(entity, off)
      case 'sensor': return this.renderSensor(entity, off)
      default: return this.renderCompact(entity, off)
    }
  }

  private stop = (e: Event) => e.stopPropagation()

  private renderLight(entity: HassEntity, off: string) {
    const on = entity.state === 'on'
    const dimmable = (entity.attributes.supported_color_modes as string[] | undefined)?.some(m => m !== 'onoff') ?? false
    const pct = on ? Math.round((entity.attributes.brightness ?? 255) / 2.55) : 0
    return this.wrap(`${on ? 'light-on' : 'light-off'} ${off}`, html`
      <div class="glow"></div>
      <div class="head">
        <ha-icon icon="mdi:lightbulb"></ha-icon>
        <span class="name">${this.label}</span>
        <span class="tag ${on ? 'on' : ''}">${on ? t(this.hass, 'on') : t(this.hass, 'off')}</span>
      </div>
      <div class="body">
        <ha-icon class="bulb" icon=${on ? 'mdi:lightbulb' : 'mdi:lightbulb-off-outline'}></ha-icon>
        ${dimmable && on ? html`<span class="big">${pct}<span class="unit">%</span></span>` : nothing}
      </div>
      ${!this.canControl(entity.entity_id) ? nothing : html`<div class="row" @click=${this.stop} @pointerdown=${this.stop}>
        <button class="switch" role="switch" style="--accent: var(--ad-warning)" aria-checked=${on} aria-label=${this.label}
          @click=${() => this.toggle(entity)}></button>
        ${dimmable ? html`<input type="range" min="1" max="100" .value=${String(pct || 1)} style="--pct:${pct}%"
          aria-label=${this.label}
          @input=${(e: Event) => (e.target as HTMLElement).style.setProperty('--pct', `${(e.target as HTMLInputElement).value}%`)}
          @change=${(e: Event) => this.call('light', 'turn_on', entity.entity_id, { brightness_pct: Number((e.target as HTMLInputElement).value) })}>` : nothing}
      </div>`}
    `)
  }

  private renderClimate(entity: HassEntity, off: string) {
    const target = entity.attributes.temperature as number | undefined
    const step = (entity.attributes.target_temp_step as number | undefined) ?? 0.5
    const setTarget = (delta: number) => target !== undefined &&
      this.call('climate', 'set_temperature', entity.entity_id, { temperature: Math.round((target + delta) / step) * step })
    const mode = entity.state
    const ctl = this.canControl(entity.entity_id)
    return this.wrap(off, html`
      <div class="head">
        <ha-icon icon="mdi:thermostat"></ha-icon>
        <span class="name">${this.label}</span>
        <span class="dot ${hvacColor(mode)}" style="width:22px;height:22px;flex-basis:22px"><ha-icon icon=${HVAC_ICONS[mode] ?? 'mdi:thermostat'} style="--mdc-icon-size:13px"></ha-icon></span>
      </div>
      <div class="body">
        <span class="big" style="text-align:left">${this.number(entity.attributes.current_temperature)}<span class="unit">°C</span></span>
      </div>
      <div class="row" @click=${this.stop} @pointerdown=${this.stop}>
        ${ctl ? html`<button class="btn" ?disabled=${!!off || target === undefined} aria-label="-" @click=${() => setTarget(-step)}><ha-icon icon="mdi:minus"></ha-icon></button>` : nothing}
        <span class="target" title=${t(this.hass, 'target')}>${this.number(target, Number.isInteger(target) ? 0 : 1)}°</span>
        ${ctl ? html`<button class="btn" ?disabled=${!!off || target === undefined} aria-label="+" @click=${() => setTarget(step)}><ha-icon icon="mdi:plus"></ha-icon></button>` : nothing}
      </div>
    `)
  }

  private renderCover(entity: HassEntity, off: string) {
    const position = entity.attributes.current_position as number | undefined
    const open = isActive(entity)
    return this.wrap(off, html`
      <div class="head">
        <ha-icon icon=${entityIcon(entity)}></ha-icon>
        <span class="name">${this.label}</span>
        <span class="tag ${open ? 'on' : ''}">${open ? t(this.hass, 'open') : t(this.hass, 'closed')}</span>
      </div>
      <div class="body">
        <span class="big" style="text-align:left">${position ?? (open ? 100 : 0)}<span class="unit">%</span></span>
      </div>
      ${!this.canControl(entity.entity_id) ? nothing : html`<div class="row end" @click=${this.stop} @pointerdown=${this.stop}>
        <button class="btn" ?disabled=${!!off} aria-label="up" @click=${() => this.call('cover', 'open_cover', entity.entity_id)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="btn" ?disabled=${!!off} aria-label="stop" @click=${() => this.call('cover', 'stop_cover', entity.entity_id)}><ha-icon icon="mdi:stop"></ha-icon></button>
        <button class="btn" ?disabled=${!!off} aria-label="down" @click=${() => this.call('cover', 'close_cover', entity.entity_id)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
      </div>`}
    `)
  }

  private renderMedia(entity: HassEntity, off: string) {
    const playing = entity.state === 'playing'
    const picture = entity.attributes.entity_picture as string | undefined
    const title = entity.attributes.media_title as string | undefined
    const artist = (entity.attributes.media_artist ?? entity.attributes.app_name) as string | undefined
    const active = playing || entity.state === 'paused'
    return this.wrap(`media ${off}`, html`
      <div class="head">
        <ha-icon icon="mdi:speaker"></ha-icon>
        <span class="name">${this.label}</span>
        <span class="tag ${playing ? 'on' : ''}">${this.hass!.formatEntityState?.(entity) ?? entity.state}</span>
      </div>
      <div class="body">
        <div class="art" style=${picture ? `background-image:url('${picture}')` : ''}>${picture ? nothing : html`<ha-icon icon="mdi:music"></ha-icon>`}</div>
        <div class="text">
          <span class="title">${title ?? this.label}</span>
          ${artist ? html`<span class="sub">${artist}</span>` : nothing}
        </div>
      </div>
      ${active && this.canControl(entity.entity_id) ? html`<div class="row end" @click=${this.stop} @pointerdown=${this.stop}>
        <button class="btn" aria-label="previous" @click=${() => this.call('media_player', 'media_previous_track', entity.entity_id)}><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        <button class="btn" aria-label="play/pause" @click=${() => this.call('media_player', 'media_play_pause', entity.entity_id)}><ha-icon icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon></button>
        <button class="btn" aria-label="next" @click=${() => this.call('media_player', 'media_next_track', entity.entity_id)}><ha-icon icon="mdi:skip-next"></ha-icon></button>
      </div>` : nothing}
    `)
  }

  private renderSensor(entity: HassEntity, off: string) {
    const { value, unit } = this.value(entity)
    return this.wrap(off, html`
      <div class="head">
        <ha-icon icon=${this.hass!.entities[entity.entity_id]?.icon ?? entityIcon(entity)}></ha-icon>
        <span class="name">${this.label}</span>
      </div>
      <div class="body">
        <span class="big" style="text-align:left">${value}${unit ? html`<span class="unit">${unit}</span>` : nothing}</span>
      </div>
    `)
  }

  private renderCompact(entity: HassEntity, off: string) {
    const domain = domainOf(entity.entity_id)
    const active = isActive(entity)
    const toggleable = ['switch', 'fan', 'input_boolean'].includes(domain)
    let color = stateColor(entity, active)
    if (domain === 'lock') color = active ? 'success' : 'warning'
    return this.wrap(`compact ${off}`, html`
      <span class="dot ${color}"><ha-icon icon=${this.hass!.entities[entity.entity_id]?.icon ?? entityIcon(entity, active)}></ha-icon></span>
      <div class="text">
        <span class="label">${this.label}</span>
        ${domain === 'scene' || domain === 'script' ? nothing : html`<span class="sub">${this.hass!.formatEntityState?.(entity) ?? entity.state}</span>`}
      </div>
      ${toggleable && this.canControl(entity.entity_id) ? html`<button class="switch" role="switch" aria-checked=${active} aria-label=${this.label}
        @pointerdown=${this.stop} @click=${(e: Event) => { e.stopPropagation(); this.toggle(entity) }}></button>` : nothing}
      ${domain === 'lock' && this.canControl(entity.entity_id) ? html`<button class="btn" aria-label=${this.label} ?disabled=${!!off}
        @pointerdown=${this.stop} @click=${(e: Event) => { e.stopPropagation(); this.toggle(entity) }}>
        <ha-icon icon=${active ? 'mdi:lock-open-variant-outline' : 'mdi:lock'}></ha-icon></button>` : nothing}
    `)
  }
}
