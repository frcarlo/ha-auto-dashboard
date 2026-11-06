// A TV like the remote on the sofa: on/off and what runs at the top, the round arrow pad with OK in the middle,
// volume beside it, back and home beneath. The arrows go through the TV's remote entity; without one the card
// keeps power and volume.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { isUnavailable } from '../presentation'
import { tokens } from '../styles/tokens'
import type { Tv } from '../appliances'

interface TvCardConfig extends BaseConfig {
  tv: Tv
}

type Key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home'

/** Key names each integration's remote.send_command understands */
const KEYS: Record<NonNullable<Tv['keys']>, Record<Key, string>> = {
  androidtv_remote: { up: 'DPAD_UP', down: 'DPAD_DOWN', left: 'DPAD_LEFT', right: 'DPAD_RIGHT', ok: 'DPAD_CENTER', back: 'BACK', home: 'HOME' },
  androidtv: { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'CENTER', back: 'BACK', home: 'HOME' },
}

// media_player supported_features bits
const VOLUME_SET = 4
const VOLUME_MUTE = 8
const VOLUME_STEP = 1024

export class AdTv extends BaseCard<TvCardConfig> {
  static styles = [tokens, css`
    :host { display: block; height: 100%; }
    .card { display: flex; flex-direction: column; gap: 16px; padding: 16px; }

    .head { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .info { all: unset; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .info:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; border-radius: 8px; }
    .info > ha-icon { --mdc-icon-size: 22px; opacity: 0.55; }
    .text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 12px; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .power { width: 40px; height: 40px; }
    .power ha-icon { --mdc-icon-size: 20px; }
    .on .power { background: rgba(var(--ad-on-surface), 0.9); color: var(--ad-surface); }

    /* The remote: arrow pad in the middle, volume to its right, back and home beneath */
    .remote { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; }
    .pad {
      grid-column: 2; position: relative; width: 168px; height: 168px; border-radius: 50%;
      background: rgba(var(--ad-on-surface), 0.06); box-shadow: inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08);
    }
    .arrow {
      all: unset; position: absolute; width: 48px; height: 48px; display: grid; place-items: center; cursor: pointer;
      border-radius: 50%; color: rgba(var(--ad-on-surface), 0.7);
      transition: background 0.15s ease, transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .arrow ha-icon { --mdc-icon-size: 24px; }
    .arrow.up { top: 4px; left: 60px; }
    .arrow.down { bottom: 4px; left: 60px; }
    .arrow.left { left: 4px; top: 60px; }
    .arrow.right { right: 4px; top: 60px; }
    .ok {
      all: unset; position: absolute; inset: 44px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
      background: var(--ad-surface); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.1);
      font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
      transition: background 0.15s ease, transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .arrow:hover, .side .btn:hover, .nav .btn:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .arrow:active, .ok:active, .side .btn:active, .nav .btn:active { transform: scale(0.96); }
    .arrow:focus-visible, .ok:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .side { grid-column: 3; justify-self: start; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .side .btn, .nav .btn { width: 40px; height: 40px; }
    .side .btn.muted { color: rgb(var(--ad-warning)); }
    .level { font-size: 12px; opacity: 0.55; font-variant-numeric: tabular-nums; }
    .nav { grid-column: 1 / -1; display: flex; justify-content: center; gap: 48px; }
    .nav .btn { display: inline-flex; gap: 6px; width: auto; padding: 0 16px; border-radius: 20px; font-size: 13px; }
    .nav .btn ha-icon { --mdc-icon-size: 18px; }
    .unavailable { opacity: 0.45; }

    @media (prefers-reduced-motion: reduce) {
      .arrow, .ok { transition: none; }
    }
  `]

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 }
  }

  getCardSize() {
    return 5
  }

  protected watched() {
    const tv = this.config!.tv
    return [tv.entity, ...(tv.remote ? [tv.remote] : [])]
  }

  private send(key: Key) {
    const tv = this.config!.tv
    if (!tv.remote || !tv.keys) return
    this.call('remote', 'send_command', tv.remote, { command: KEYS[tv.keys][key] })
  }

  private key(key: Key, icon: string, label: string) {
    return html`<button class="arrow ${key}" aria-label=${label} @click=${() => this.send(key)}><ha-icon icon=${icon}></ha-icon></button>`
  }

  protected render() {
    const hass = this.hass!
    const tv = this.config!.tv
    const player = hass.states[tv.entity]
    const off = !player || isUnavailable(player)
    const on = !!player && !off && !['off', 'standby'].includes(player.state)
    const control = !off && this.canControl(tv.entity)
    const a = player?.attributes ?? {}
    const features = Number(a.supported_features ?? 0)
    const now = on ? (a.app_name ?? a.source ?? a.media_title) as string | undefined : undefined
    const sub = off ? t(hass, 'unavailable') : on ? now ?? t(hass, 'on') : t(hass, 'off')
    const pad = on && control && !!tv.remote && !!tv.keys
    const volume = on && control && !!(features & (VOLUME_STEP | VOLUME_SET))
    const level = typeof a.volume_level === 'number' ? Math.round(a.volume_level * 100) : undefined
    return html`<div class="card ${on ? 'on' : ''} ${off ? 'unavailable' : ''}">
      <div class="head">
        <button class="info" @click=${() => this.moreInfo(tv.entity)}>
          <ha-icon icon=${on ? 'mdi:television-play' : 'mdi:television'}></ha-icon>
          <span class="text"><span class="title">${tv.name}</span><span class="sub">${sub}</span></span>
        </button>
        ${control ? html`<button class="btn power" aria-label=${t(hass, 'tv_power')} title=${t(hass, 'tv_power')}
          @click=${() => this.call('media_player', on ? 'turn_off' : 'turn_on', tv.entity)}><ha-icon icon="mdi:power"></ha-icon></button>` : nothing}
      </div>
      ${pad || volume ? html`<div class="remote">
        ${pad ? html`<div class="pad">
          ${this.key('up', 'mdi:chevron-up', t(hass, 'tv_up'))}
          ${this.key('left', 'mdi:chevron-left', t(hass, 'tv_left'))}
          <button class="ok" aria-label="OK" @click=${() => this.send('ok')}>OK</button>
          ${this.key('right', 'mdi:chevron-right', t(hass, 'tv_right'))}
          ${this.key('down', 'mdi:chevron-down', t(hass, 'tv_down'))}
        </div>` : nothing}
        ${volume ? html`<div class="side">
          <button class="btn" aria-label=${t(hass, 'tv_louder')} @click=${() => this.call('media_player', 'volume_up', tv.entity)}><ha-icon icon="mdi:volume-plus"></ha-icon></button>
          ${level !== undefined ? html`<span class="level">${level}</span>` : nothing}
          <button class="btn" aria-label=${t(hass, 'tv_quieter')} @click=${() => this.call('media_player', 'volume_down', tv.entity)}><ha-icon icon="mdi:volume-minus"></ha-icon></button>
          ${features & VOLUME_MUTE ? html`<button class="btn ${a.is_volume_muted ? 'muted' : ''}" aria-label=${t(hass, 'tv_mute')} aria-pressed=${!!a.is_volume_muted}
            @click=${() => this.call('media_player', 'volume_mute', tv.entity, { is_volume_muted: !a.is_volume_muted })}>
            <ha-icon icon=${a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-mute'}></ha-icon></button>` : nothing}
        </div>` : nothing}
        ${pad ? html`<div class="nav">
          <button class="btn" @click=${() => this.send('back')}><ha-icon icon="mdi:arrow-u-left-top"></ha-icon>${t(hass, 'tv_back')}</button>
          <button class="btn" @click=${() => this.send('home')}><ha-icon icon="mdi:home-outline"></ha-icon>${t(hass, 'tv_home')}</button>
        </div>` : nothing}
      </div>` : nothing}
    </div>`
  }
}
