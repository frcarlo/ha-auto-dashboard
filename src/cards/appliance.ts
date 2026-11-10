// A household appliance: what it does now in words, a ring with the time left while a program runs,
// start and end beneath, and notes like an open door or salt running low. On Home it shows only while
// something happens (running, waiting to be emptied, needing attention).
import { css, html, nothing, svg } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import {
  ACTIVE_PHASES, applianceIcon, appliancePhase, applianceProgress, applianceTimes, programLabel,
  type Appliance, type AppliancePhase,
} from '../appliances'
import { entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'

interface ApplianceCardConfig extends BaseConfig {
  appliance: Appliance
  /** Home: hidden while the appliance is idle */
  only_active?: boolean
}

/** The phase's color: amber while it works, green when done, red when it needs someone */
const COLOR: Partial<Record<AppliancePhase, string>> = { running: 'warning', delayed: 'warning', finished: 'success', action: 'error', error: 'error' }

/** Re-reckons the time left while a program runs */
const TICK_MS = 30_000

// The ring: 270° open at the bottom, like a dial
const R = 32
const C = 40
const SWEEP = 270
const ARC = (2 * Math.PI * R * SWEEP) / 360

export class AdAppliance extends BaseCard<ApplianceCardConfig> {
  static properties = { ...BaseCard.properties, now: { state: true } }
  now = Date.now()
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; height: 100%; }
    :host([hidden]) { display: none; }
    .card { display: flex; flex-direction: column; gap: 12px; padding: 16px; cursor: pointer; }
    .card:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }

    .head { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: var(--ad-fs-m); }
    .head ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); flex: 0 0 auto; }
    .head .title { font-weight: 500; white-space: nowrap; }
    .head .program { opacity: var(--ad-o2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

    .body { display: flex; align-items: center; gap: 16px; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .state { font-size: var(--ad-fs-xl); font-weight: 400; line-height: 1.1; }
    .warning .state { color: rgb(var(--ad-warning)); }
    .success .state { color: rgb(var(--ad-success)); }
    .error .state { color: rgb(var(--ad-error)); }
    .sub { font-size: var(--ad-fs-s); opacity: var(--ad-o2); font-variant-numeric: tabular-nums; }

    /* The time left inside an open ring that fills with the program */
    .ring { position: relative; width: 80px; height: 80px; flex: 0 0 80px; }
    .ring svg { width: 100%; height: 100%; transform: rotate(135deg); }
    .ring circle { fill: none; stroke-width: 6; stroke-linecap: round; }
    .ring .rail { stroke: rgba(var(--ad-on-surface), 0.1); }
    .ring .arc { stroke: rgba(var(--ad-on-surface), 0.45); transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
    .warning .ring .arc { stroke: rgb(var(--ad-warning)); }
    .success .ring .arc { stroke: rgb(var(--ad-success)); }
    .ring .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
    .ring .left { font-size: var(--ad-fs-l); font-weight: 300; line-height: 1; }
    .ring .left small { font-size: var(--ad-fs-xs); opacity: var(--ad-o2); margin-left: 1px; }
    .ring .pct { font-size: var(--ad-fs-xs); opacity: var(--ad-o3); margin-top: 2px; }
    .ring ha-icon { --mdc-icon-size: 28px; color: rgb(var(--ad-success)); }

    /* From start to end, the dot where the program is now */
    .timeline { display: flex; flex-direction: column; gap: 4px; }
    .track { position: relative; height: 4px; border-radius: 2px; background: rgba(var(--ad-on-surface), 0.1); }
    .track span { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: rgb(var(--ad-warning)); width: var(--p); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
    .times { display: flex; justify-content: space-between; font-size: var(--ad-fs-s); opacity: var(--ad-o3); font-variant-numeric: tabular-nums; }

    .notes { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: var(--ad-fs-s); }
    .note { display: inline-flex; align-items: center; gap: 4px; color: rgb(var(--ad-warning)); }
    .note ha-icon { --mdc-icon-size: 14px; }

    @media (prefers-reduced-motion: reduce) {
      .ring .arc, .track span { transition: none; }
    }
  `]

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 }
  }

  getCardSize() {
    return 3
  }

  connectedCallback() {
    super.connectedCallback()
    this.timer = window.setInterval(() => {
      // Only a running program needs the clock
      if (this.hass && this.config && appliancePhase(this.hass, this.config.appliance) === 'running') this.now = Date.now()
    }, TICK_MS)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
  }

  protected watched() {
    const a = this.config!.appliance
    return [a.status, a.progress, a.end, a.remaining, a.program, a.phase, a.door, a.power, ...(a.notices ?? [])].filter((id): id is string => !!id)
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.hass?.locale?.language ?? this.hass?.language, { hour: '2-digit', minute: '2-digit' })
  }

  /** "1 h 24 min" or "24 min" */
  private duration(ms: number) {
    const minutes = Math.max(0, Math.round(ms / 60_000))
    const h = Math.floor(minutes / 60)
    return h ? `${h} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`
  }

  private notes(a: Appliance) {
    const hass = this.hass!
    const out: string[] = []
    const door = hass.states[a.door ?? '']
    if (door && ['open', 'on'].includes(door.state)) out.push(t(hass, 'door_open'))
    for (const id of a.notices ?? []) {
      const e = hass.states[id]
      if (e?.state === 'present') out.push(shortName(entityName(e), a.name))
    }
    return out
  }

  private renderRing(phase: AppliancePhase, progress: number, end?: number) {
    const left = end !== undefined ? Math.max(0, end - this.now) : undefined
    const minutes = left !== undefined ? Math.round(left / 60_000) : undefined
    return html`<div class="ring" role="img" aria-label="${Math.round(progress)} %">
      ${svg`<svg viewBox="0 0 80 80">
        <circle class="rail" cx=${C} cy=${C} r=${R} stroke-dasharray="${ARC} 999"></circle>
        <circle class="arc" cx=${C} cy=${C} r=${R} stroke-dasharray="${ARC} 999" stroke-dashoffset=${ARC * (1 - progress / 100)}></circle>
      </svg>`}
      <div class="mid">
        ${phase === 'finished' ? html`<ha-icon icon="mdi:check"></ha-icon>`
          : minutes === undefined ? html`<span class="left">${Math.round(progress)}<small>%</small></span>`
          : minutes >= 60 ? html`<span class="left">${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}<small>h</small></span>`
          : html`<span class="left">${minutes}<small>min</small></span>`}
        ${phase !== 'finished' && minutes !== undefined ? html`<span class="pct">${Math.round(progress)} %</span>` : nothing}
      </div>
    </div>`
  }

  protected render() {
    const hass = this.hass!
    const a = this.config!.appliance
    const phase = appliancePhase(hass, a)
    const hide = !!this.config!.only_active && !ACTIVE_PHASES.includes(phase)
    this.hidden = hide
    if (hide) return nothing
    const progress = applianceProgress(hass, a, phase)
    const { end, start } = applianceTimes(hass, a, this.now, progress)
    const program = ['running', 'paused', 'delayed', 'finished'].includes(phase) ? programLabel(hass, a.program) : undefined
    const step = hass.states[a.phase ?? '']
    const stepText = step && !['unknown', 'unavailable', 'none', ''].includes(step.state) ? hass.formatEntityState?.(step) ?? step.state : undefined
    const status = hass.states[a.status]
    const since = status?.last_changed ? t(hass, 'since', { time: this.time(Date.parse(status.last_changed)) }) : undefined
    // Without times (a plug-only appliance) the run shows how long it goes and what it draws
    const powerEntity = hass.states[a.power ?? ''] ?? (status?.attributes.device_class === 'power' ? status : undefined)
    const power = powerEntity && Number.isFinite(Number(powerEntity.state)) ? `${this.value(powerEntity).value} ${this.value(powerEntity).unit}` : undefined
    const sub = phase === 'running' || phase === 'paused'
      ? (end !== undefined
        ? [stepText, t(hass, 'done_at', { time: this.time(end) }), progress === undefined ? t(hass, 'time_left', { time: this.duration(end - this.now) }) : undefined]
        : [stepText, since, power]).filter(Boolean).join(' · ')
      : phase === 'delayed' && end !== undefined ? t(hass, 'done_at', { time: this.time(end) })
      : phase === 'finished' ? since : undefined
    const notes = this.notes(a)
    const ring = progress !== undefined
    return html`<div class="card ${COLOR[phase] ?? ''}" role="button" tabindex="0"
      aria-label="${a.name}: ${t(hass, `appliance.${phase}` as Key)}"
      @click=${() => this.moreInfo(a.status)} @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && this.moreInfo(a.status)}>
      <div class="head">
        <ha-icon icon=${applianceIcon(a.kind)}></ha-icon>
        <span class="title">${a.name}</span>
        ${program ? html`<span class="program">${program}</span>` : nothing}
      </div>
      <div class="body">
        <div class="text">
          <span class="state">${t(hass, `appliance.${phase}` as Key)}</span>
          ${sub ? html`<span class="sub">${sub}</span>` : nothing}
        </div>
        ${ring ? this.renderRing(phase, progress, end) : nothing}
      </div>
      ${phase === 'running' && start !== undefined && end !== undefined ? html`<div class="timeline">
        <div class="track" style="--p:${progress ?? 0}%"><span></span></div>
        <div class="times"><span>${this.time(start)}</span><span>${this.time(end)}</span></div>
      </div>` : nothing}
      ${notes.length ? html`<div class="notes">${notes.map(n => html`<span class="note"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${n}</span>`)}</div>` : nothing}
    </div>`
  }
}
