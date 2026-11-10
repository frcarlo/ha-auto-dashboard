// What the maintenance page shows admins about HA itself: repairs, integrations that fail, errors in the log,
// how busy the server is and how the backups stand. Plain functions over what HA's websocket API returns.

export interface Issue {
  domain: string
  issue_id: string
  translation_key?: string | null
  translation_placeholders?: Record<string, string> | null
  severity: 'critical' | 'error' | 'warning' | string
  ignored?: boolean
  is_fixable?: boolean
  created?: string
}

export interface ConfigEntry {
  entry_id: string
  domain: string
  title: string
  state: string
  source?: string
  disabled_by?: string | null
  reason?: string | null
}

export interface FlowProgress {
  flow_id: string
  handler: string
  context?: { source?: string; title_placeholders?: Record<string, string> }
}

export interface LogEntry {
  name: string
  message: string[]
  level: string
  source?: [string, number]
  timestamp: number
  first_occurred?: number
  count?: number
  exception?: string
}

export interface BackupInfo {
  backups?: { backup_id: string; name?: string; date: string; agents?: Record<string, { size?: number }>; failed_agent_ids?: string[] }[]
  last_attempted_automatic_backup?: string | null
  last_completed_automatic_backup?: string | null
  next_automatic_backup?: string | null
  state?: string
}

export interface Health {
  cpu?: number
  memory?: number
  disk_used?: number
  disk_total?: number
}

const SEVERITY = ['critical', 'error', 'warning']

/** Repairs the admin has not ignored, the most severe first */
export function openIssues(issues: Issue[] = []): Issue[] {
  return issues
    .filter(i => !i.ignored)
    .sort((a, b) => (SEVERITY.indexOf(a.severity) + 4) % 4 - (SEVERITY.indexOf(b.severity) + 4) % 4 || String(b.created ?? '').localeCompare(String(a.created ?? '')))
}

/** An issue's title from HA's translations, like HA's repairs page; else its key in words */
export function issueTitle(issue: Issue, resources: Record<string, string> = {}): string {
  const key = issue.translation_key || issue.issue_id
  const text = resources[`component.${issue.domain}.issues.${key}.title`]
  if (!text) return `${issue.domain}: ${key.replace(/[_:]+/g, ' ')}`
  return text.replace(/\{(\w+)\}/g, (all, name) => issue.translation_placeholders?.[name] ?? all)
}

/** States in which an integration is set up but does not work */
const FAILED = ['setup_error', 'setup_retry', 'migration_error', 'failed_unload']

export interface FailedIntegration {
  entry_id?: string
  domain: string
  title: string
  /** setup_error, setup_retry, … or reauth when it waits for a new sign-in */
  state: string
  reason?: string
}

/** Integrations that failed to set up and those that wait for a new sign-in; ignored discoveries and disabled entries stay out */
export function failedIntegrations(entries: ConfigEntry[] = [], flows: FlowProgress[] = []): FailedIntegration[] {
  const failed: FailedIntegration[] = entries
    .filter(e => FAILED.includes(e.state) && !e.disabled_by && e.source !== 'ignore')
    .map(e => ({ entry_id: e.entry_id, domain: e.domain, title: e.title, state: e.state, ...(e.reason ? { reason: e.reason } : {}) }))
  const reauth: FailedIntegration[] = flows
    .filter(f => f.context?.source === 'reauth')
    .map(f => ({ domain: f.handler, title: f.context?.title_placeholders?.name ?? f.handler, state: 'reauth' }))
  return [...reauth, ...failed]
}

/** Errors in HA's log, the latest first */
export const logErrors = (entries: LogEntry[] = []) =>
  entries.filter(e => e.level === 'ERROR' || e.level === 'CRITICAL').sort((a, b) => b.timestamp - a.timestamp)

/** "custom_components.device_pulse.coordinator" → "device_pulse" */
export function logSource(entry: LogEntry): string {
  const name = entry.name.replace(/^homeassistant\.components\./, '').replace(/^custom_components\./, '')
  return name.split('.')[0] ?? name
}

export interface BackupStatus {
  /** The last backup that went through */
  last?: { date: string; size?: number; name?: string }
  next?: string
  /** The last automatic backup was tried after the last one that went through, so it failed */
  failed: boolean
  running: boolean
}

export function backupStatus(info: BackupInfo | undefined): BackupStatus | undefined {
  if (!info) return undefined
  const latest = [...(info.backups ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]
  const size = latest ? Math.max(0, ...Object.values(latest.agents ?? {}).map(a => a.size ?? 0)) : 0
  const attempted = Date.parse(info.last_attempted_automatic_backup ?? '')
  const completed = Date.parse(info.last_completed_automatic_backup ?? '')
  return {
    ...(latest ? { last: { date: latest.date, ...(size ? { size } : {}), ...(latest.name ? { name: latest.name } : {}) } } : {}),
    ...(info.next_automatic_backup ? { next: info.next_automatic_backup } : {}),
    // A backup is attempted first and completed later, so only an attempt with no completion after it failed
    failed: Number.isFinite(attempted) && (!Number.isFinite(completed) || completed < attempted) && info.state === 'idle',
    running: !!info.state && info.state !== 'idle',
  }
}

/** Supervisor's numbers: CPU and memory of HA Core in percent, the disk in GB */
export function health(core: { cpu_percent?: number; memory_percent?: number } | undefined, host: { disk_used?: number; disk_total?: number } | undefined): Health | undefined {
  const out: Health = {
    ...(typeof core?.cpu_percent === 'number' ? { cpu: core.cpu_percent } : {}),
    ...(typeof core?.memory_percent === 'number' ? { memory: core.memory_percent } : {}),
    ...(typeof host?.disk_used === 'number' && typeof host.disk_total === 'number' && host.disk_total > 0 ? { disk_used: host.disk_used, disk_total: host.disk_total } : {}),
  }
  return Object.keys(out).length ? out : undefined
}

/** 8808304640 → "8.2 GB" */
export function formatBytes(bytes: number, language = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toLocaleString(language, { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${units[i]}`
}

/** "vor 5 Stunden", "in 19 Stunden" */
export function relativeTime(iso: string | number, language = 'en', now = Date.now()): string {
  const ms = (typeof iso === 'number' ? iso : Date.parse(iso)) - now
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  const abs = Math.abs(ms)
  if (abs < 60_000) return rtf.format(Math.round(ms / 1000), 'second')
  if (abs < 3_600_000) return rtf.format(Math.round(ms / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), 'hour')
  return rtf.format(Math.round(ms / 86_400_000), 'day')
}
