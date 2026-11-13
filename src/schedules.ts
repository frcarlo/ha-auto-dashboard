// HA's schedule helpers (Settings → Helpers → Schedule): a week of time blocks per helper, on inside a block and
// off outside. HA keeps the blocks in its storage, not in the entity, so they come from schedule/list and go back
// with schedule/update, the same calls HA's own helper dialog makes. Changing them needs an admin; YAML schedules
// are not in the list and stay read only.
import { t } from './i18n'
import type { HomeAssistant } from './types'

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Day = (typeof DAYS)[number]

/** A block as HA stores it: times as HH:MM:SS, the end may be 24:00:00 */
export interface RawBlock { from: string; to: string; data?: Record<string, unknown> }

export type ScheduleItem = { id: string; name: string; icon?: string } & Partial<Record<Day, RawBlock[]>>

/** A block in minutes since midnight; the end of the day is 1440 */
export interface Block { from: number; to: number; data?: Record<string, unknown> }

export const DAY_MINUTES = 24 * 60

export function parseTime(text: string): number {
  const [h = 0, m = 0] = text.split(':').map(Number)
  return Math.min(DAY_MINUTES, Math.max(0, h * 60 + m))
}

/** 450 → 07:30:00; the end of the day stays 24:00:00, which HA takes as midnight */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

/** 07:30, for a time input and for reading; the end of the day reads 24:00 */
export const shortTime = (minutes: number) => formatTime(minutes).slice(0, 5)

/** A day's blocks in order */
export function blocksOf(item: ScheduleItem, day: Day): Block[] {
  return (item[day] ?? [])
    .map(b => ({ from: parseTime(b.from), to: parseTime(b.to), ...(b.data && Object.keys(b.data).length ? { data: b.data } : {}) }))
    .sort((a, b) => a.from - b.from)
}

export type BlockProblem = 'order' | 'overlap'

/** What HA would refuse: a block that ends before it starts, or two that overlap */
export function checkBlocks(blocks: Block[]): BlockProblem | undefined {
  if (blocks.some(b => b.to <= b.from)) return 'order'
  const sorted = [...blocks].sort((a, b) => a.from - b.from)
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.from < sorted[i - 1]!.to) return 'overlap'
  return undefined
}

/** Days are Monday first; JavaScript counts from Sunday */
export const dayOf = (date: Date): Day => DAYS[(date.getDay() + 6) % 7]!

/** The item with the blocks put on each of the days, everything else kept */
export function withBlocks(item: ScheduleItem, days: Day[], blocks: Block[]): ScheduleItem {
  const raw: RawBlock[] = [...blocks].sort((a, b) => a.from - b.from)
    .map(b => ({ from: formatTime(b.from), to: formatTime(b.to), ...(b.data ? { data: b.data } : {}) }))
  const out: ScheduleItem = { ...item }
  for (const day of days) out[day] = raw.map(b => ({ ...b }))
  return out
}

/** HA replaces the whole helper on update, so name, icon and all seven days go along */
export function updateMessage(item: ScheduleItem): Record<string, unknown> {
  return {
    type: 'schedule/update', schedule_id: item.id, name: item.name,
    ...(item.icon ? { icon: item.icon } : {}),
    ...Object.fromEntries(DAYS.map(day => [day, item[day] ?? []])),
  }
}

/**
 * The stored helper behind each entity. The entity is named after the helper's id until someone renames it;
 * for a renamed one the entity registry knows the id. Entities without a stored helper (YAML) are left out.
 */
export async function loadSchedules(hass: HomeAssistant, entityIds: string[]): Promise<Map<string, ScheduleItem>> {
  const out = new Map<string, ScheduleItem>()
  if (!hass.callWS || !entityIds.length) return out
  const items = await hass.callWS<ScheduleItem[]>({ type: 'schedule/list' })
  const byId = new Map(items.map(i => [i.id, i]))
  await Promise.all(entityIds.map(async entityId => {
    let item = byId.get(entityId.slice('schedule.'.length))
    if (!item) {
      const entry = await hass.callWS!<{ unique_id?: string }>({ type: 'config/entity_registry/get', entity_id: entityId }).catch(() => undefined)
      item = entry?.unique_id ? byId.get(entry.unique_id) : undefined
    }
    if (item) out.set(entityId, item)
  }))
  return out
}

/** On or off, and until when: "An bis 22:30", with the weekday in front when that is not today */
export function scheduleStatus(hass: HomeAssistant, entityId: string, now = new Date()): { on: boolean; text: string } {
  const e = hass.states[entityId]
  if (!e) return { on: false, text: '' }
  const on = e.state === 'on'
  const next = Date.parse(String(e.attributes.next_event ?? ''))
  if (!Number.isFinite(next)) return { on, text: t(hass, on ? 'sched.on' : 'sched.off') }
  const lang = hass.locale?.language ?? hass.language
  const date = new Date(next)
  const time = date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  const when = date.toDateString() === now.toDateString() ? time
    : `${date.toLocaleDateString(lang, { weekday: 'short' }).replace(/\.$/, '')} ${time}`
  return { on, text: t(hass, on ? 'sched.on_until' : 'sched.off_until', { time: when }) }
}
