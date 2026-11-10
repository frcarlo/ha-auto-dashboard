import { describe, expect, it } from 'vitest'
import { backupStatus, failedIntegrations, formatBytes, health, issueTitle, logErrors, logSource, openIssues } from '../src/system'
import { generateDashboard } from '../src/strategy'
import { createHass } from '../dev/mock'

describe('repairs', () => {
  const issues = [
    { domain: 'a', issue_id: 'x', severity: 'warning', created: '2026-11-01' },
    { domain: 'b', issue_id: 'y', severity: 'error', created: '2026-10-01' },
    { domain: 'c', issue_id: 'z', severity: 'critical', ignored: true },
  ]

  it('leaves out ignored ones and puts the severe first', () => {
    expect(openIssues(issues).map(i => i.issue_id)).toEqual(['y', 'x'])
  })

  it("titles them with HA's translations and fills in the placeholders", () => {
    const issue = { domain: 'homeassistant', issue_id: 'i', translation_key: 'deprecated_yaml', translation_placeholders: { integration_title: 'Ping' }, severity: 'warning' }
    expect(issueTitle(issue, { 'component.homeassistant.issues.deprecated_yaml.title': 'The {integration_title} YAML is removed' })).toBe('The Ping YAML is removed')
    expect(issueTitle(issue, {})).toBe('homeassistant: deprecated yaml')
  })
})

describe('integrations', () => {
  it('lists failed setups and sign-ins, not ignored discoveries or disabled entries', () => {
    const entries = [
      { entry_id: '1', domain: 'hue', title: 'Hue', state: 'loaded' },
      { entry_id: '2', domain: 'wiz', title: 'WiZ', state: 'setup_retry', reason: 'Failed to connect' },
      { entry_id: '3', domain: 'fritz', title: 'Repeater', state: 'not_loaded', source: 'ignore' },
      { entry_id: '4', domain: 'shelly', title: 'Plug', state: 'setup_error', disabled_by: 'user' },
      { entry_id: '5', domain: 'fritz', title: 'Box', state: 'setup_retry', source: 'ignore' },
    ]
    const flows = [{ flow_id: 'f', handler: 'spotify', context: { source: 'reauth', title_placeholders: { name: 'Spotify Frank' } } }, { flow_id: 'g', handler: 'hue', context: { source: 'zeroconf' } }]
    expect(failedIntegrations(entries, flows)).toEqual([
      { domain: 'spotify', title: 'Spotify Frank', state: 'reauth' },
      { entry_id: '2', domain: 'wiz', title: 'WiZ', state: 'setup_retry', reason: 'Failed to connect' },
    ])
  })
})

describe('log', () => {
  it('keeps errors, the latest first, and names where they come from', () => {
    const log = [
      { name: 'homeassistant.components.sonos.speaker', message: ['a'], level: 'ERROR', timestamp: 1 },
      { name: 'custom_components.device_pulse.coordinator', message: ['b'], level: 'WARNING', timestamp: 3 },
      { name: 'custom_components.device_pulse.coordinator', message: ['c'], level: 'CRITICAL', timestamp: 2 },
    ]
    expect(logErrors(log).map(e => e.message[0])).toEqual(['c', 'a'])
    expect(log.map(logSource)).toEqual(['sonos', 'device_pulse', 'device_pulse'])
  })
})

describe('backups', () => {
  it('takes the latest backup and its size', () => {
    expect(backupStatus({
      backups: [{ backup_id: 'a', date: '2026-11-09T05:00:00Z', agents: {} }, { backup_id: 'b', date: '2026-11-10T05:00:00Z', agents: { x: { size: 100 }, y: { size: 120 } } }],
      last_attempted_automatic_backup: '2026-11-10T05:00:00Z', last_completed_automatic_backup: '2026-11-10T05:30:00Z', next_automatic_backup: '2026-11-11T05:00:00Z', state: 'idle',
    })).toEqual({ last: { date: '2026-11-10T05:00:00Z', size: 120 }, next: '2026-11-11T05:00:00Z', failed: false, running: false })
  })

  it('counts an attempt with no completion after it as failed, but not while one runs', () => {
    const info = { backups: [], last_attempted_automatic_backup: '2026-11-10T05:00:00Z', last_completed_automatic_backup: '2026-11-09T05:30:00Z', state: 'idle' }
    expect(backupStatus(info)?.failed).toBe(true)
    expect(backupStatus({ ...info, state: 'create_backup' })).toMatchObject({ failed: false, running: true })
  })
})

describe('health', () => {
  it("reads Supervisor's numbers and leaves out what is missing", () => {
    expect(health({ cpu_percent: 10.2, memory_percent: 23.5 }, { disk_used: 54.2, disk_total: 1877.1 })).toEqual({ cpu: 10.2, memory: 23.5, disk_used: 54.2, disk_total: 1877.1 })
    expect(health(undefined, undefined)).toBeUndefined()
    expect(formatBytes(8_808_304_640)).toBe('8.2 GB')
  })
})

describe('maintenance page', () => {
  const page = async (admin: boolean) => {
    const hass = createHass(true)
    const { views } = await generateDashboard({ type: 'custom:auto-dashboard' }, { ...hass, user: { ...hass.user!, is_admin: admin } })
    const nav = (views[0] as any).sections.flatMap((s: any) => s.cards).find((c: any) => c.type === 'custom:ad-nav-bar')
    const view = views.find(v => v.path === 'maintenance') as any
    const sources = view.sections.flatMap((s: any) => s.cards).filter((c: any) => c.source).map((c: any) => c.source)
    const spans = view.sections.map((s: any) => s.column_span)
    return { nav: nav.items.map((i: any) => i.path), sources, spans }
  }

  it('gives admins HA itself and a place in the bar', async () => {
    const { nav, sources } = await page(true)
    expect(nav).toContain('maintenance')
    expect(sources).toEqual(['health', 'backup', 'repairs', 'integrations', 'updates', 'battery', 'unavailable', 'log'])
  })

  it('fills the rows: the load and the log across, four short blocks, then two halves', async () => {
    const { spans } = await page(true)
    // Between the page header and the bar
    expect(spans.slice(1, -1)).toEqual([4, 1, 1, 1, 1, 2, 2, 4])
  })

  it('keeps batteries and unavailable devices for everyone else, reached through the chips', async () => {
    const { nav, sources } = await page(false)
    expect(nav).not.toContain('maintenance')
    expect(sources).toEqual(['battery', 'unavailable'])
  })
})
