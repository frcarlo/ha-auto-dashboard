// Admin lists on the maintenance page: how busy the server is, repairs, integrations that fail, errors in the log,
// backups. The card asks HA's websocket API itself and asks again every minute while it is on screen.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import {
  backupStatus, failedIntegrations, formatBytes, health, issueTitle, logErrors, logSource, openIssues, relativeTime,
  type BackupInfo, type ConfigEntry, type FailedIntegration, type FlowProgress, type Health, type Issue, type LogEntry,
} from '../system'
import { tokens } from '../styles/tokens'

export type SystemSource = 'health' | 'repairs' | 'integrations' | 'log' | 'backup'

interface SystemConfig extends BaseConfig {
  source: SystemSource
}

/** Rows shown before "Show all" opens HA's own page */
const MAX_ROWS = 6

const REFRESH_MS: Record<SystemSource, number> = { health: 30_000, repairs: 60_000, integrations: 60_000, log: 60_000, backup: 60_000 }

/** A page of HA's settings, e.g. /config/repairs */
function openHa(path: string) {
  history.pushState(null, '', path)
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }))
}

export class AdSystem extends BaseCard<SystemConfig> {
  static properties = {
    ...BaseCard.properties,
    data: { state: true },
    failed: { state: true },
    busy: { state: true },
  }

  data?: {
    health?: Health
    issues?: Issue[]
    titles?: Record<string, string>
    integrations?: FailedIntegration[]
    log?: LogEntry[]
    backup?: BackupInfo
  }

  failed = false
  busy = false
  private timer?: number

  static styles = [tokens, css`
    :host { display: block; }
    .card { padding: 6px; display: flex; flex-direction: column; gap: 2px; }
    .item { all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; cursor: pointer; font-size: 13px; }
    .item:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .item:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .item > ha-icon { --mdc-icon-size: 18px; opacity: 0.6; flex: none; }
    .item.error > ha-icon { color: rgb(var(--ad-error)); opacity: 1; }
    .item.warning > ha-icon { color: rgb(var(--ad-warning)); opacity: 1; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 11px; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .s { opacity: 0.6; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { display: flex; align-items: center; gap: 10px; padding: 10px; font-size: 13px; opacity: 0.6; }
    .empty ha-icon { color: rgb(var(--ad-success)); }
    .empty.off ha-icon { color: inherit; }
    .more { all: unset; align-self: flex-start; margin: 2px 10px 6px; font-size: 12px; color: rgb(var(--ad-primary)); cursor: pointer; }
    .more:focus-visible { outline: 2px solid rgb(var(--ad-primary)); border-radius: 6px; }

    .meters { display: grid; gap: 12px; padding: 12px 14px; }
    .meter { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 4px 10px; font-size: 13px; }
    .meter ha-icon { --mdc-icon-size: 18px; opacity: 0.6; grid-row: span 2; }
    .meter .v { font-variant-numeric: tabular-nums; opacity: 0.7; font-size: 12px; }
    .bar { grid-column: 2 / 4; height: 6px; border-radius: 3px; background: rgba(var(--ad-on-surface), 0.1); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 3px; background: rgb(var(--ad-primary)); }
    .bar i.warning { background: rgb(var(--ad-warning)); }
    .bar i.error { background: rgb(var(--ad-error)); }

    .backup { display: flex; align-items: center; gap: 12px; padding: 10px; }
    .backup > ha-icon { --mdc-icon-size: 22px; color: rgb(var(--ad-success)); }
    .backup.failed > ha-icon { color: rgb(var(--ad-error)); }
    .backup .text .name { white-space: normal; }
    .act {
      all: unset; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; cursor: pointer; font-size: 13px;
      background: rgba(var(--ad-primary), 0.14); color: rgb(var(--ad-primary)); white-space: nowrap;
    }
    .act ha-icon { --mdc-icon-size: 16px; }
    .act[disabled] { opacity: 0.5; cursor: default; }
    .act:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 3
  }

  connectedCallback() {
    super.connectedCallback()
    this.schedule(0)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    clearTimeout(this.timer)
  }

  protected updated(changed: Map<string, unknown>) {
    // The first hass arrives after connecting
    if (changed.has('hass') && !this.data && !this.failed && this.timer === undefined) this.schedule(0)
  }

  private schedule(ms: number) {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void this.load(), ms)
  }

  private async load() {
    const hass = this.hass
    const source = this.config?.source
    if (!hass?.callWS || !source || !this.isConnected) {
      this.timer = undefined
      return
    }
    const ws = <T>(msg: Record<string, unknown>) => hass.callWS!<T>(msg)
    try {
      if (source === 'health') {
        const [core, host] = await Promise.all([
          ws<{ cpu_percent?: number; memory_percent?: number }>({ type: 'supervisor/api', endpoint: '/core/stats', method: 'get' }).catch(() => undefined),
          ws<{ disk_used?: number; disk_total?: number }>({ type: 'supervisor/api', endpoint: '/host/info', method: 'get' }).catch(() => undefined),
        ])
        const h = health(core, host)
        this.failed = !h
        this.data = h ? { health: h } : undefined
      } else if (source === 'repairs') {
        const { issues } = await ws<{ issues: Issue[] }>({ type: 'repairs/list_issues' })
        const open = openIssues(issues)
        const domains = [...new Set(open.map(i => i.domain))]
        const titles = domains.length
          ? (await ws<{ resources: Record<string, string> }>({ type: 'frontend/get_translations', language: hass.language, category: 'issues', integration: domains }).catch(() => ({ resources: {} }))).resources
          : {}
        this.data = { issues: open, titles }
      } else if (source === 'integrations') {
        const [entries, flows] = await Promise.all([
          ws<ConfigEntry[]>({ type: 'config_entries/get' }),
          ws<FlowProgress[]>({ type: 'config_entries/flow/progress' }).catch(() => []),
        ])
        this.data = { integrations: failedIntegrations(entries, flows) }
      } else if (source === 'log') {
        this.data = { log: logErrors(await ws<LogEntry[]>({ type: 'system_log/list' })) }
      } else {
        this.data = { backup: await ws<BackupInfo>({ type: 'backup/info' }) }
      }
    } catch {
      this.failed = true
    }
    // A running backup is checked more often, so the card shows soon when it is done
    const running = source === 'backup' && this.data?.backup?.state && this.data.backup.state !== 'idle'
    this.schedule(running ? 5_000 : REFRESH_MS[source])
  }

  private async backupNow() {
    if (this.busy || !this.hass?.callWS) return
    this.busy = true
    try {
      await this.hass.callWS({ type: 'backup/generate_with_automatic_settings' })
    } catch {
      // HA says why on its own backup page; the card just stops waiting
    }
    this.busy = false
    this.schedule(1_000)
  }

  private language() {
    return this.hass?.language ?? 'en'
  }

  private item(icon: string, name: string, sub: string | undefined, value: string | undefined, onClick: () => void, tone = '') {
    return html`<button class="item ${tone}" @click=${onClick}>
      <ha-icon icon=${icon}></ha-icon>
      <span class="text"><span class="name">${name}</span>${sub ? html`<span class="sub">${sub}</span>` : nothing}</span>
      ${value ? html`<span class="s">${value}</span>` : nothing}
    </button>`
  }

  private list<T>(items: T[], row: (item: T) => unknown, more: string, allGood: string) {
    if (!items.length) return html`<div class="empty"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${allGood}</div>`
    return html`${items.slice(0, MAX_ROWS).map(row)}
      <button class="more" @click=${() => openHa(more)}>${items.length > MAX_ROWS ? t(this.hass, 'sys.show_all', { n: items.length }) : t(this.hass, 'sys.open_ha')}</button>`
  }

  private renderHealth(h: Health) {
    const meter = (icon: string, label: string, percent: number, value: string) => {
      const tone = percent >= 90 ? 'error' : percent >= 75 ? 'warning' : ''
      return html`<div class="meter" role="meter" aria-label=${label} aria-valuenow=${Math.round(percent)} aria-valuemin="0" aria-valuemax="100">
        <ha-icon icon=${icon}></ha-icon><span>${label}</span><span class="v">${value}</span>
        <span class="bar"><i class=${tone} style="width:${Math.min(100, Math.max(1, percent))}%"></i></span>
      </div>`
    }
    const pct = (n: number) => `${n.toLocaleString(this.language(), { maximumFractionDigits: n < 10 ? 1 : 0 })} %`
    return html`<div class="meters">
      ${h.cpu !== undefined ? meter('mdi:cpu-64-bit', t(this.hass, 'sys.cpu'), h.cpu, pct(h.cpu)) : nothing}
      ${h.memory !== undefined ? meter('mdi:memory', t(this.hass, 'sys.memory'), h.memory, pct(h.memory)) : nothing}
      ${h.disk_total ? meter('mdi:harddisk', t(this.hass, 'sys.disk'), (h.disk_used! / h.disk_total) * 100,
        t(this.hass, 'sys.disk_of', { used: Math.round(h.disk_used!), total: Math.round(h.disk_total) })) : nothing}
    </div>`
  }

  private renderBackup(info: BackupInfo) {
    const status = backupStatus(info)!
    const lang = this.language()
    const line = status.running ? t(this.hass, 'sys.backup_running')
      : status.failed ? t(this.hass, 'sys.backup_failed')
      : status.last ? t(this.hass, 'sys.backup_last', { when: relativeTime(status.last.date, lang) })
      : t(this.hass, 'sys.backup_none')
    const sub = [
      status.last?.size ? formatBytes(status.last.size, lang) : '',
      status.next ? t(this.hass, 'sys.backup_next', { when: relativeTime(status.next, lang) }) : '',
    ].filter(Boolean).join(' · ')
    const busy = this.busy || status.running
    return html`<div class="backup ${status.failed || !status.last ? 'failed' : ''}">
      <ha-icon icon=${status.running ? 'mdi:progress-upload' : status.failed || !status.last ? 'mdi:alert-circle-outline' : 'mdi:check-circle-outline'}></ha-icon>
      <span class="text"><span class="name">${line}</span>${sub ? html`<span class="sub">${sub}</span>` : nothing}</span>
      <button class="act" ?disabled=${busy} @click=${() => this.backupNow()}>
        <ha-icon icon="mdi:backup-restore"></ha-icon>${t(this.hass, busy ? 'sys.backup_running_short' : 'sys.backup_now')}</button>
    </div>
    <button class="more" @click=${() => openHa('/config/backup')}>${t(this.hass, 'sys.open_backups')}</button>`
  }

  protected render() {
    const source = this.config!.source
    if (this.failed) {
      return html`<div class="card"><div class="empty off"><ha-icon icon="mdi:information-outline"></ha-icon>
        ${t(this.hass, source === 'health' ? 'sys.no_supervisor' : 'sys.unavailable')}</div></div>`
    }
    const d = this.data
    if (!d) return html`<div class="card"><div class="empty off"><ha-icon icon="mdi:timer-sand"></ha-icon>${t(this.hass, 'sys.loading')}</div></div>`
    const lang = this.language()
    let body: unknown = nothing
    if (source === 'health' && d.health) body = this.renderHealth(d.health)
    else if (source === 'backup' && d.backup) body = this.renderBackup(d.backup)
    else if (source === 'repairs') {
      body = this.list(d.issues ?? [], i => this.item(
        i.severity === 'warning' ? 'mdi:alert-outline' : 'mdi:alert-circle-outline', issueTitle(i, d.titles), i.domain, undefined,
        () => openHa('/config/repairs'), i.severity === 'warning' ? 'warning' : 'error',
      ), '/config/repairs', t(this.hass, 'sys.no_repairs'))
    } else if (source === 'integrations') {
      body = this.list(d.integrations ?? [], i => this.item(
        i.state === 'reauth' ? 'mdi:account-key-outline' : 'mdi:puzzle-remove-outline', i.title,
        i.reason ?? t(this.hass, `sys.state.${i.state}` as 'sys.state.setup_error'), i.domain,
        () => openHa(`/config/integrations/integration/${i.domain}`), i.state === 'setup_retry' ? 'warning' : 'error',
      ), '/config/integrations/dashboard', t(this.hass, 'sys.no_integrations'))
    } else if (source === 'log') {
      body = this.list(d.log ?? [], e => this.item(
        'mdi:alert-circle-outline', e.message[0] ?? e.name,
        [logSource(e), relativeTime(e.timestamp * 1000, lang)].join(' · '), (e.count ?? 1) > 1 ? `${e.count}×` : undefined,
        () => openHa('/config/logs'), 'error',
      ), '/config/logs', t(this.hass, 'sys.no_errors'))
    }
    return html`<div class="card">${body}</div>`
  }
}
