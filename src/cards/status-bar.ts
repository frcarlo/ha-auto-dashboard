// Home page glance chips, after HArmony's StatusBarWidget.vue, with who is home and the alarm in front.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { allEntities, batteryEntities, deviceName, entityAreaId, entityIndex, hideOf, homeStatus, unavailableDevices, type StatusKey } from '../model'
import { entityIcon, entityName, shortName } from '../presentation'
import { tokens } from '../styles/tokens'
import { peopleIds, peopleStyles, renderPeople } from './people'
import { schoolIds, schoolNotes, type School, type SchoolNote } from '../school'
import type { HassEntity, StatusChip } from '../types'

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
}

type SchoolChip = 'cancelled' | 'changed'

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
  static properties = { ...BaseCard.properties, open: { state: true } }
  open: StatusKey | SchoolChip | null = null

  static styles = [tokens, peopleStyles, css`
    :host { display: block; }
    .chips { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: -2px; }
    /* People first, then a hairline, then what is going on */
    .sep { display: none; }
    .chips .people + .sep { display: block; flex: 0 0 1px; align-self: stretch; margin: 4px 4px; background: rgba(var(--ad-on-surface), 0.12); }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 7px 12px 7px 9px; border-radius: 999px; background: var(--ad-surface); box-shadow: var(--ad-shadow);
      font-size: 13px; transition: background 0.2s ease;
    }
    :host([glass]) .chip { background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur); }
    .chip ha-icon { --mdc-icon-size: 17px; }
    .chip .n { font-weight: 600; }
    .chip .l { opacity: 0.65; }
    .chip.warning ha-icon { color: rgb(var(--ad-warning)); }
    .chip.primary ha-icon { color: rgb(var(--ad-primary)); }
    .chip.error ha-icon { color: rgb(var(--ad-error)); }
    .chip.muted ha-icon { opacity: 0.5; }
    .chip[aria-expanded=true] { background: var(--ad-surface-variant); }
    .chip:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .quiet { cursor: default; }
    .quiet ha-icon { color: rgb(var(--ad-success)); }
    .list { margin-top: 8px; padding: 6px; border-radius: 20px; display: flex; flex-direction: column; gap: 2px; }
    .item { all: unset; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; cursor: pointer; font-size: 13px; }
    .item:hover { background: rgba(var(--ad-on-surface), 0.06); }
    .item ha-icon { --mdc-icon-size: 18px; opacity: 0.6; }
    .item .a { opacity: 0.45; font-size: 12px; white-space: nowrap; }
    .item .s { margin-left: auto; opacity: 0.55; font-size: 12px; white-space: nowrap; }
    .more { all: unset; align-self: flex-end; display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 12px; cursor: pointer; font-size: 12px; color: rgb(var(--ad-primary)); }
    .more:hover { background: rgba(var(--ad-primary), 0.1); }
    .item .who { opacity: 0.45; font-size: 12px; white-space: nowrap; }
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
    return [...entityIndex(this.hass!, labels).all, ...batteryEntities(this.hass!, areas, labels, hidden).map(e => e.entity_id), ...(this.config!.people === false ? [] : peopleIds(this.hass!, this.config!)), ...schoolIds(this.config!.schools ?? [])]
  }

  private areaName(entity: HassEntity) {
    // A dashboard for one room needs no room names in the list
    if (this.config?.areas?.length === 1) return undefined
    return this.hass!.areas[entityAreaId(this.hass!, entity.entity_id) ?? '']?.name
  }

  private time(ms: number) {
    return new Date(ms).toLocaleTimeString(this.hass?.locale?.language ?? this.hass?.language, { hour: 'numeric', minute: '2-digit' })
  }

  private flip(key: StatusKey | SchoolChip) {
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

  protected render() {
    const { hide_labels: labels, hide_entities: hidden, areas } = this.config!
    const hide = hideOf(this.config!)
    const items = homeStatus(allEntities(this.hass!, hide, areas), batteryEntities(this.hass!, areas, labels, hidden), unavailableDevices(this.hass!, hide, areas), { presence: !!this.config!.presence })
      .filter(item => !this.config!.hide_chips?.includes(item.key))
    const school = this.config!.schools?.length ? schoolNotes(this.hass!, this.config!.schools, Date.now()) : undefined
    const openSchool = school && (this.open === 'cancelled' || this.open === 'changed') ? school[this.open] : undefined
    const openItem = items.find(i => i.key === this.open)
    const link = openItem && this.config!.links?.[openItem.key]
    return html`
      <div class="chips">
        ${this.config!.people === false ? nothing : renderPeople(this.hass!, this.config!, id => this.moreInfo(id))}
        <span class="sep"></span>
        ${school ? [this.schoolChip('cancelled', school.cancelled), this.schoolChip('changed', school.changed)] : nothing}
        ${items.length ? items.map(item => html`
          <button class="chip ${COLORS[item.key]}" aria-expanded=${this.open === item.key} @click=${() => this.flip(item.key)}>
            <ha-icon icon=${ICONS[item.key]}></ha-icon>
            ${item.key === 'presence' ? nothing : html`<span class="n">${item.entities.length}</span>`}
            <span class="l">${t(this.hass, `status.${item.key}`)}</span>
          </button>`)
        : school ? nothing : html`<span class="chip quiet"><ha-icon icon="mdi:check-circle-outline"></ha-icon><span class="l">${t(this.hass, 'all_quiet')}</span></span>`}
      </div>
      ${openSchool?.length ? this.schoolList(this.open as SchoolChip, openSchool) : nothing}
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
