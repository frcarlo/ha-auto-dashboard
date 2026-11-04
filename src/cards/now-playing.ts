// "Now playing" on Home: the most recently started player with artwork, title, room and play/pause/next.
// Paused players stay a few minutes so they can be resumed. Hides itself when nothing plays.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { allEntities, entityAreaId } from '../model'
import { domainOf, entityName } from '../presentation'
import { tokens } from '../styles/tokens'
import type { HassEntity } from '../types'

interface NowPlayingConfig extends BaseConfig {
  hide_domains?: string[]
  hide_labels?: string[]
  areas?: string[]
}

/** How long a paused player stays in the bar. */
const PAUSED_FOR = 5 * 60_000

// media_player supported_features bits
const PAUSE = 1
const NEXT_TRACK = 32
const PLAY = 16384

export class AdNowPlaying extends BaseCard<NowPlayingConfig> {
  static properties = { ...BaseCard.properties, picked: { state: true } }
  /** Player the user switched to with +N or controlled; stays while it is still active */
  picked?: string
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; }
    :host([hidden]) { display: none; }
    .card { display: flex; align-items: center; gap: 12px; padding: 8px 10px 8px 8px; cursor: pointer; }
    .art {
      width: 48px; height: 48px; flex: 0 0 48px; border-radius: 14px; display: grid; place-items: center;
      background: center / cover rgba(var(--ad-on-surface), 0.08);
    }
    .art ha-icon { opacity: 0.45; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btns { display: flex; align-items: center; gap: 6px; }
    .btn { width: 34px; height: 34px; }
    .btn.main { background: rgb(var(--ad-primary)); color: #fff; }
    .more {
      all: unset; cursor: pointer; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
      background: rgba(var(--ad-on-surface), 0.08);
    }
    .more:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  connectedCallback() {
    super.connectedCallback()
    // Paused players drop out after a while without any state change
    this.timer = window.setInterval(() => this.requestUpdate(), 30_000)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
  }

  private get players() {
    const { hide_domains: domains, hide_labels: labels, areas } = this.config!
    return allEntities(this.hass!, { domains, labels }, areas).filter(e => domainOf(e.entity_id) === 'media_player')
  }

  protected watched() {
    return this.players.map(e => e.entity_id)
  }

  /** Playing first, most recently started first; then players paused in the last few minutes. */
  private active(): HassEntity[] {
    const since = (e: HassEntity) => Date.parse(e.last_changed ?? '') || 0
    const playing = this.players.filter(e => e.state === 'playing').sort((a, b) => since(b) - since(a))
    const paused = this.players.filter(e => e.state === 'paused' && Date.now() - since(e) < PAUSED_FOR).sort((a, b) => since(b) - since(a))
    return [...playing, ...paused]
  }

  protected updated() {
    // HA's card wrapper hides hidden cards, so an idle bar leaves no gap
    const hidden = !this.active().length
    if (this.hidden !== hidden) {
      this.hidden = hidden
      this.dispatchEvent(new Event('card-visibility-changed', { bubbles: true, composed: true }))
    }
  }

  private next(list: HassEntity[], current: HassEntity) {
    this.picked = list[(list.indexOf(current) + 1) % list.length]!.entity_id
  }

  private control(player: HassEntity, service: string) {
    this.picked = player.entity_id
    this.call('media_player', service, player.entity_id)
  }

  protected render() {
    const list = this.active()
    const player = list.find(e => e.entity_id === this.picked) ?? list[0]
    if (!player) return nothing
    const a = player.attributes
    const features = Number(a.supported_features ?? 0)
    const playing = player.state === 'playing'
    const picture = a.entity_picture as string | undefined
    const area = this.hass!.areas[entityAreaId(this.hass!, player.entity_id) ?? '']?.name
    const title = (a.media_title ?? a.app_name ?? entityName(player)) as string
    const artist = (a.media_artist ?? a.media_album_artist) as string | undefined
    const sub = [artist ?? (a.media_title ? a.app_name : undefined), area ?? entityName(player)].filter(Boolean).join(' · ')
    const ctl = this.canControl(player.entity_id)
    const stop = (e: Event) => e.stopPropagation()

    return html`<div class="card" role="button" tabindex="0" @click=${() => this.moreInfo(player.entity_id)}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.moreInfo(player.entity_id)}>
      <div class="art" style=${picture ? `background-image:url('${picture}')` : ''}>${picture ? nothing : html`<ha-icon icon="mdi:music"></ha-icon>`}</div>
      <div class="text">
        <span class="title">${title}</span>
        <span class="sub">${sub}</span>
      </div>
      <div class="btns" @click=${stop}>
        ${list.length > 1 ? html`<button class="more" aria-label=${t(this.hass, 'next_player')} title=${t(this.hass, 'next_player')}
          @click=${() => this.next(list, player)}>+${list.length - 1}</button>` : nothing}
        ${ctl && features & (playing ? PAUSE : PLAY) ? html`<button class="btn main" aria-label="play/pause"
          @click=${() => this.control(player, 'media_play_pause')}><ha-icon icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon></button>` : nothing}
        ${ctl && features & NEXT_TRACK ? html`<button class="btn" aria-label="next"
          @click=${() => this.control(player, 'media_next_track')}><ha-icon icon="mdi:skip-next"></ha-icon></button>` : nothing}
      </div>
    </div>`
  }
}
