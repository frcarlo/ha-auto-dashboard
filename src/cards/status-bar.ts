// Home page glance chips, after HArmony's StatusBarWidget.vue, with who is home and the alarm in front.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { allEntities, batteryEntities, deviceName, entityAreaId, entityIndex, hideOf, homeStatus, unavailableDevices, type StatusKey } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import { peopleIds, peopleStyles, renderPeople } from './people'
import { personPanelStyles, renderPersonPanel } from './person-panel'
import { personPhones } from '../phones'
import { schoolIds, schoolNotes, type School, type SchoolNote } from '../school'
import {
  applianceChipIcon, binColor, birthdays, currentWarnings, finishedAppliances, stuffyRooms, trackedParcels, wastePickup, warningName,
  type CalendarHit, type EventKey, type EventSources, type Parcel, type ParcelStage,
} from '../events'

const PARCEL_ICONS: Record<ParcelStage, string> = { today: 'mdi:truck-delivery-outline', pickup: 'mdi:store-outline', transit: 'mdi:package-variant-closed' }
import { applianceEntities } from '../appliances'
import type { ApiEvent } from '../calendar'
import type { HassEntity, HomeAssistant, StatusChip } from '../types'

interface StatusBarConfig extends BaseConfig {
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
  /** Only count entities in these areas (dashboard filtered to rooms or floors) */
  areas?: string[]
  /** Status keys whose list ends with a link to a view showing all of them */
  links?: Partial<Record<StatusKey, string>>
  /** false on a room page: who is home and the alarm belong to the house, not to one room */
  people?: boolean
  /** On a room page: a chip while motion or presence is detected in the room */
  presence?: boolean
  /** Pupils with a WebUntis timetable: cancelled and changed lessons today or tomorrow get chips of their own */
  schools?: School[]
  /** Chips not shown here, e.g. unavailable devices on a family tablet */
  hide_chips?: StatusChip[]
  /** Where the chips for what's coming up come from: bins, warnings, birthdays, parcels, appliances, CO₂ */
  events?: EventSources
}

type SchoolChip = 'cancelled' | 'changed'

/** A chip for something coming up, and the rows its list shows */
interface EventChip {
  key: EventKey
  icon: string
  color: 'primary' | 'warning' | 'error' | 'success' | 'muted'
  /** The bin's own colour for its icon */
  tint?: string
  label: string
  rows: { icon: string; text: string; sub?: string; entity?: string; tint?: string }[]
}

/** Today's events per calendar, shared by every status bar on the page; fetched again after a while or the next day */
const STALE_MS = 30 * 60_000
const calendarCache = new Map<string, { day: string; at: number; hits: CalendarHit[] }>()
const loadingCalendars = new Set<string>()

async function todaysEvents(hass: HomeAssistant, calendars: string[], now: number): Promise<boolean> {
  const day = new Date(now).toDateString()
  const due = calendars.filter(id => {
    const c = calendarCache.get(id)
    return !loadingCalendars.has(id) && (!c || c.day !== day || now - c.at > STALE_MS)
  })
  if (!due.length || !hass.callApi) return false
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  const range = `start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`
  due.forEach(id => loadingCalendars.add(id))
  await Promise.all(due.map(async id => {
    try {
      const list = await hass.callApi!<ApiEvent[]>('GET', `calendars/${id}?${range}`)
      calendarCache.set(id, { day, at: Date.now(), hits: (list ?? []).map(e => ({ calendar: id, title: e.summary ?? '' })) })
    } catch {
      calendarCache.set(id, { day, at: Date.now(), hits: [] })
    } finally {
      loadingCalendars.delete(id)
    }
  }))
  return true
}

const hitsOf = (calendars: string[] = [], now: number) => {
  const day = new Date(now).toDateString()
  return calendars.flatMap(id => (calendarCache.get(id)?.day === day ? calendarCache.get(id)!.hits : []))
}

const ICONS: Record<StatusKey, string> = {
  presence: 'mdi:motion-sensor',
  lights: 'mdi:lightbulb-group',
  openings: 'mdi:window-open-variant',
  unlocked: 'mdi:lock-open-variant-outline',
  heating: 'mdi:fire',
  media: 'mdi:play-circle',
  battery: 'mdi:battery-alert-variant-outline',
  unavailable: 'mdi:lan-disconnect',
}

const COLORS: Record<StatusKey, string> = {
  presence: 'primary',
  lights: 'warning', openings: 'warning', unlocked: 'warning', heating: 'warning',
  media: 'primary', battery: 'error', unavailable: 'muted',
}

export class AdStatusBar extends BaseCard<StatusBarConfig> {
  static properties = { ...BaseCard.properties, open: { state: true }, now: { state: true }, phone: { state: true } }
  /** The open list: a chip's, or a person's devices as "person:<entity id>" */
  open: StatusKey | SchoolChip | EventKey | `person:${string}` | null = null
  /** The device whose details show in an open person's list */
  phone?: string
  /** Ticks every minute: bins show from the afternoon before, calendars are fetched again */
  now = Date.now()
  private timer?: number

  connectedCallback() {
    super.connectedCallback()
    this.timer = window.setInterval(() => (this.now = Date.now()), 60_000)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
  }

  protected updated() {
    const ev = this.config?.events
    if (!ev || !this.hass) return
    const calendars = [...(ev.birthdays ?? []), ...(ev.parcels ?? [])]
    if (calendars.length) void todaysEvents(this.hass, calendars, this.now).then(changed => changed && this.requestUpdate())
  }

  static styles = [tokens, peopleStyles, personPanelStyles, css`
    :host { display: block; }
    .chips { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    /* People first, then a hairline, then what is going on */
    .sep { display: none; }
    .chips .people + .sep { display: block; flex: 0 0 1px; align-self: stretch; margin: 4px 4px; background: rgba(var(--ad-on-surface), 0.12); }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 7px 12px 7px 9px; border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
      font-size: var(--ad-fs-s); transition: background 0.2s ease;
    }
    :host([glass]) .chip { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .chip ha-icon { --mdc-icon-size: 17px; }
    .chip .n { font-weight: 600; }
    .chip .l { opacity: var(--ad-o2); }
    .chip.warning ha-icon { color: rgb(var(--ad-warning)); }
    .chip.primary ha-icon { color: rgb(var(--ad-primary)); }
    .chip.error ha-icon { color: rgb(var(--ad-error)); }
    .chip.muted ha-icon { opacity: var(--ad-o3); }
    .chip.success ha-icon { color: rgb(var(--ad-success)); }
    .chip ha-icon.tint, .item ha-icon.tint { color: var(--tint); opacity: 1; }
    .chip[aria-expanded=true] { background: var(--ad-surface-variant); }
    .chip:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .quiet { cursor: default; }
    .quiet ha-icon { color: rgb(var(--ad-success)); }
    .list { margin-top: 8px; padding: 6px; border-radius: 20px; display: flex; flex-direction: column; gap: 2px; }
    .item { all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; cursor: pointer; font-size: var(--ad-fs-s); }
    .item:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .item ha-icon { --mdc-icon-size: 18px; opacity: var(--ad-o2); }
    .item .a { opacity: var(--ad-o3); font-size: var(--ad-fs-s); white-space: nowrap; }
    .item .s { margin-left: auto; opacity: var(--ad-o2); font-size: var(--ad-fs-s); white-space: nowrap; }
    .more { all: unset; align-self: flex-end; display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 12px; cursor: pointer; font-size: var(--ad-fs-s); color: rgb(var(--ad-primary)); }
    .more:hover { background: rgba(var(--ad-primary), 0.1); }
    .item .who { opacity: var(--ad-o3); font-size: var(--ad-fs-s); white-space: nowrap; }
    .item.cancelled .s { color: rgb(var(--ad-error)); opacity: 1; }
    .item.changed .s { color: rgb(var(--ad-warning)); opacity: 1; }
    .more ha-icon { --mdc-icon-size: 16px; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 1
  }

  protected watched() {
    const { areas, hide_labels: labels, hide_entities: hidden } = this.config!
    return [...entityIndex(this.hass!, labels).all, ...batteryEntities(this.hass!, areas, labels, hidden).map(e => e.entity_id), ...(this.config!.people === false ? [] : peopleIds(this.hass!, this.config!)), ...schoolIds(this.config!.schools ?? []), ...this.eventIds(), ...this.openPhones.flatMap(p => p.entities)]
  }

  /** The devices of the person whose list is open */
  private get openPhones() {
    const id = typeof this.open === 'string' && this.open.startsWith('person:') ? this.open.slice(7) : undefined
    return id ? personPhones(this.hass!, this.hass!.states[id]) : []
  }

  /** A tap on a person: their phones and watches when the Companion app knows them, else HA's own dialog */
  private openPerson(id: string) {
    if (!id.startsWith('person.') || !personPhones(this.hass!, this.hass!.states[id]).length) return this.moreInfo(id)
    const key = `person:${id}` as const
    this.open = this.open === key ? null : key
    this.phone = undefined
  }

  private eventIds() {
    const ev = this.config!.events
    if (!ev) return []
    return [
      ...(ev.waste ?? []), ...(ev.warnings ?? []), ...(ev.co2 ?? []), ...(ev.birthdays ?? []), ...(ev.parcels ?? []), ...(ev.parcel_sensors ?? []),
      ...(ev.appliances ?? []).flatMap(a => applianceEntities(this.hass!, a)),
    ]
  }

  private areaName(entity: HassEntity) {
    // A dashboard for one room needs no room names in the list
    if (this.config?.areas?.length === 1) return undefined
    return this.hass!.areas[entityAreaId(this.hass!, entity.entity_id) ?? '']?.name
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.hass?.locale?.language ?? this.hass?.language, { hour: 'numeric', minute: '2-digit' })
  }

  private flip(key: StatusKey | SchoolChip | EventKey) {
    this.open = this.open === key ? null : key
  }

  /** "3 Ausfälle morgen": cancelled lessons in red, changed ones in amber */
  private schoolChip(key: SchoolChip, notes: SchoolNote[]) {
    if (!notes.length) return nothing
    // "morgen" when all of them are tomorrow; mixed days leave it to the list
    const kinds = new Set(notes.map(n => n.kind))
    const when = kinds.size === 1 ? [...kinds][0] : undefined
    const label = t(this.hass, notes.length === 1 ? `chip.${key}_one` : `chip.${key}`, { when: when ? t(this.hass, `school.when_${when}`) : '' }).trim()
    return html`<button class="chip ${key === 'cancelled' ? 'error' : 'warning'}" aria-expanded=${this.open === key} @click=${() => this.flip(key)}>
      <ha-icon icon=${key === 'cancelled' ? 'mdi:calendar-remove-outline' : 'mdi:swap-horizontal'}></ha-icon>
      <span class="n">${notes.length}</span><span class="l">${label}</span>
    </button>`
  }

  /** The lessons behind a school chip; each opens the pupil's timetable */
  private schoolList(key: SchoolChip, notes: SchoolNote[]) {
    const several = (this.config!.schools?.length ?? 0) > 1
    const mixed = new Set(notes.map(n => n.kind)).size > 1
    return html`<div class="list card">${notes.map(({ school, lesson, kind }) => html`
      <button class="item ${key}" @click=${() => school.timetable && this.moreInfo(school.timetable)}>
        <ha-icon icon="mdi:school-outline"></ha-icon>
        <span>${this.time(lesson.start)} ${lesson.subject}</span>
        ${several || mixed ? html`<span class="who">${[several ? school.name : '', mixed ? t(this.hass, `school.when_${kind}`) : ''].filter(Boolean).join(' · ')}</span>` : nothing}
        <span class="s">${key === 'cancelled' ? t(this.hass, 'school.cancelled')
          : [lesson.text, lesson.room_changed ? lesson.room : '', lesson.teacher_changed ? t(this.hass, 'school.teacher_changed') : ''].filter(Boolean).join(' · ')}</span>
      </button>`)}
    </div>`
  }

  /** The chips for what's coming up, most pressing first */
  private eventChips(): EventChip[] {
    const ev = this.config!.events
    if (!ev) return []
    const hass = this.hass!
    const now = this.now
    const out: EventChip[] = []
    const when = (day: 'today' | 'tomorrow') => t(hass, `school.when_${day}`)

    const warnings = currentWarnings(hass, ev.warnings, now)
    if (warnings.length) {
      out.push({
        key: 'warning', icon: 'mdi:alert-outline', color: warnings.some(w => w.severity === 'error') ? 'error' : 'warning',
        label: warnings.length === 1 ? warningName(warnings[0]!) : t(hass, 'event.warnings', { n: warnings.length }),
        rows: warnings.map(w => ({
          icon: w.severity === 'error' ? 'mdi:alert-octagon-outline' : 'mdi:alert-outline', text: w.headline, entity: w.entity_id,
          ...(w.until ? { sub: t(hass, 'until', { time: this.time(Date.parse(w.until)) }) } : {}),
        })),
      })
    }

    const pickup = wastePickup(hass, ev.waste, now)
    if (pickup) {
      const tint = binColor(pickup.bins[0]!.name)
      out.push({
        key: 'waste', icon: 'mdi:trash-can-outline', color: 'primary', ...(tint ? { tint } : {}),
        label: `${pickup.bins.map(b => b.name).join(', ')} ${when(pickup.day)}`,
        rows: pickup.bins.map(b => ({ icon: 'mdi:trash-can-outline', text: b.name, sub: when(pickup.day), entity: b.entity, ...(binColor(b.name) ? { tint: binColor(b.name)! } : {}) })),
      })
    }

    const names = birthdays(hitsOf(ev.birthdays, now))
    if (names.length) {
      out.push({
        key: 'birthday', icon: 'mdi:cake-variant-outline', color: 'primary',
        label: names.length <= 2 ? t(hass, names.length === 1 ? 'event.birthday_one' : 'event.birthday', { names: names.join(t(hass, 'event.and')) }) : t(hass, 'event.birthdays', { n: names.length }),
        rows: names.map(n => ({ icon: 'mdi:cake-variant-outline', text: n, sub: t(hass, 'event.birthday_row') })),
      })
    }

    // One chip for all parcels, named after the most pressing: due today, then waiting at a shop, then on the way
    const parcels = hitsOf(ev.parcels, now)
    const tracked = trackedParcels(hass, ev.parcel_sensors, now)
    if (parcels.length || tracked.length) {
      const count = (stage: ParcelStage) => tracked.filter(p => p.stage === stage).length
      const today = parcels.length + count('today')
      const [stage, n] = today ? ['today', today] as const : count('pickup') ? ['pickup', count('pickup')] as const : ['transit', count('transit')] as const
      const window = (p: Parcel) => p.from ? `${this.time(p.from)}${p.to ? `–${this.time(p.to)}` : ''}` : ''
      out.push({
        key: 'parcel', icon: PARCEL_ICONS[stage], color: stage === 'transit' ? 'muted' : 'primary',
        label: t(hass, n === 1 ? `event.parcel_${stage}_one` : `event.parcel_${stage}`, { n }),
        rows: [
          ...parcels.map(p => ({ icon: PARCEL_ICONS.today, text: p.title || t(hass, 'event.parcel_today_one'), sub: entityName(hass.states[p.calendar]), entity: p.calendar })),
          ...tracked.map(p => ({
            icon: PARCEL_ICONS[p.stage], text: p.sender || p.carrier || t(hass, 'event.parcel'),
            sub: [p.sender ? p.carrier : '', t(hass, `event.stage_${p.stage}`), window(p)].filter(Boolean).join(' · '), entity: p.entity,
          })),
        ],
      })
    }

    const done = finishedAppliances(hass, ev.appliances)
    if (done.length) {
      const name = (a: (typeof done)[number]) => (a.kind === 'appliance' ? a.name : t(hass, `event.kind.${a.kind}`))
      out.push({
        key: 'appliance', icon: applianceChipIcon(done), color: 'success',
        label: t(hass, 'event.done', { names: done.map(name).join(', ') }),
        rows: done.map(a => ({ icon: applianceChipIcon([a]), text: name(a), sub: t(hass, 'appliance.finished'), entity: a.status })),
      })
    }

    const rooms = stuffyRooms(hass, ev.co2, ev.co2_limit)
    if (rooms.length) {
      // A room page needs no room name: there it is just the value
      const single = this.config!.areas?.length === 1
      out.push({
        key: 'co2', icon: 'mdi:molecule-co2', color: rooms[0]!.value >= 2000 ? 'error' : 'warning',
        label: rooms.length === 1 ? (single || !rooms[0]!.area ? t(hass, 'event.co2_here') : t(hass, 'event.co2_room', { room: rooms[0]!.area! })) : t(hass, 'event.co2_rooms', { n: rooms.length }),
        rows: rooms.map(r => ({ icon: 'mdi:molecule-co2', text: r.area ?? entityName(hass.states[r.entity]), sub: `${Math.round(r.value)} ppm`, entity: r.entity })),
      })
    }
    return out.filter(c => !this.config!.hide_chips?.includes(c.key))
  }

  private eventChip(chip: EventChip) {
    return html`<button class="chip ${chip.color}" aria-expanded=${this.open === chip.key} @click=${() => this.flip(chip.key)}>
      <ha-icon class=${chip.tint ? 'tint' : ''} style=${chip.tint ? `--tint:${chip.tint}` : ''} icon=${chip.icon}></ha-icon>
      <span class="l">${chip.label}</span>
    </button>`
  }

  private eventList(chip: EventChip) {
    return html`<div class="list card">${chip.rows.map(r => html`
      <button class="item" @click=${() => r.entity && this.moreInfo(r.entity)}>
        <ha-icon class=${r.tint ? 'tint' : ''} style=${r.tint ? `--tint:${r.tint}` : ''} icon=${r.icon}></ha-icon>
        <span>${r.text}</span>
        ${r.sub ? html`<span class="s">${r.sub}</span>` : nothing}
      </button>`)}
    </div>`
  }

  protected render() {
    const { hide_labels: labels, hide_entities: hidden, areas } = this.config!
    const hide = hideOf(this.config!)
    const items = homeStatus(allEntities(this.hass!, hide, areas), batteryEntities(this.hass!, areas, labels, hidden), unavailableDevices(this.hass!, hide, areas), { presence: !!this.config!.presence })
      .filter(item => !this.config!.hide_chips?.includes(item.key))
    const school = this.config!.schools?.length ? schoolNotes(this.hass!, this.config!.schools, Date.now()) : undefined
    const openSchool = school && (this.open === 'cancelled' || this.open === 'changed') ? school[this.open] : undefined
    const events = this.eventChips()
    const openEvent = events.find(c => c.key === this.open)
    const openItem = items.find(i => i.key === this.open)
    const link = openItem && this.config!.links?.[openItem.key]
    const phones = this.openPhones
    const openPerson = phones.length ? this.hass!.states[(this.open as string).slice(7)] : undefined
    return html`
      <div class="chips">
        ${this.config!.people === false ? nothing : renderPeople(this.hass!, this.config!, id => this.openPerson(id), this.open)}
        <span class="sep"></span>
        ${events.filter(c => c.key === 'warning').map(c => this.eventChip(c))}
        ${school ? [this.schoolChip('cancelled', school.cancelled), this.schoolChip('changed', school.changed)] : nothing}
        ${events.filter(c => c.key !== 'warning').map(c => this.eventChip(c))}
        ${items.length ? items.map(item => html`
          <button class="chip ${COLORS[item.key]}" aria-expanded=${this.open === item.key} @click=${() => this.flip(item.key)}>
            <ha-icon icon=${ICONS[item.key]}></ha-icon>
            ${item.key === 'presence' ? nothing : html`<span class="n">${item.entities.length}</span>`}
            <span class="l">${t(this.hass, `status.${item.key}`)}</span>
          </button>`)
        : school || events.length ? nothing : html`<span class="chip quiet"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span class="l">${t(this.hass, 'all_quiet')}</span></span>`}
      </div>
      ${openSchool?.length ? this.schoolList(this.open as SchoolChip, openSchool) : nothing}
      ${openEvent ? this.eventList(openEvent) : nothing}
      ${openPerson && phones.length ? renderPersonPanel(this.hass!, openPerson, phones, {
        open: this.phone, now: this.now, moreInfo: id => this.moreInfo(id),
        pick: id => { this.phone = this.phone === id ? undefined : id },
      }) : nothing}
      ${openItem ? html`<div class="list card">
        ${openItem.entities.map(e => {
          const area = this.areaName(e)
          const name = shortName(this.open === 'unavailable' ? deviceName(this.hass!, e) : entityName(e), area)
          return html`
            <button class="item" @click=${() => this.moreInfo(e.entity_id)}>
              <ha-icon icon=${entityIcon(e)}></ha-icon>
              <span>${name}</span>
              ${area && area !== name ? html`<span class="a">${area}</span>` : nothing}
              <span class="s">${this.hass!.formatEntityState?.(e) ?? e.state}</span>
            </button>`
        })}
        ${link ? html`<button class="more" @click=${() => this.navigate(link)}>
          ${t(this.hass, 'show_all')}<ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>` : nothing}
      </div>` : nothing}
    `
  }
}
