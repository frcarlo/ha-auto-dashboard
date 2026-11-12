// Who is home and the alarm panel, as avatars and one chip. The status bar shows them in front of its chips,
// so Home spends one row on them instead of two.
import { css, html, nothing } from 'lit'
import { t } from '../i18n'
import { entityIndex } from '../model'
import { domainOf, entityName } from '../presentation'
import type { HassEntity, HomeAssistant } from '../types'

export interface PeopleOptions {
  hide_domains?: string[]
  hide_labels?: string[]
  hide_entities?: string[]
}

const ALARM_ICONS: Record<string, string> = {
  disarmed: 'mdi:shield-off-outline',
  triggered: 'mdi:bell-ring',
  arming: 'mdi:shield-sync-outline',
  pending: 'mdi:shield-sync-outline',
}

/** Triggered is red and pulses, armed blue, disarmed green, arming or pending grey. */
function alarmColor(state: string) {
  if (state === 'triggered') return 'error'
  if (state.startsWith('armed')) return 'info'
  if (state === 'disarmed') return 'success'
  return ''
}

/** People and the alarm panel follow the dashboard's hide options; rooms don't matter for them. */
export function visibleOf(hass: HomeAssistant, options: PeopleOptions, domain: string): HassEntity[] {
  if (options.hide_domains?.includes(domain)) return []
  return entityIndex(hass, options.hide_labels).all
    .filter(id => domainOf(id) === domain && !options.hide_entities?.includes(id))
    .map(id => hass.states[id]!)
    .filter(Boolean)
}

export const peopleIds = (hass: HomeAssistant, options: PeopleOptions) =>
  [...visibleOf(hass, options, 'person'), ...visibleOf(hass, options, 'alarm_control_panel')].map(e => e.entity_id)

export function renderPeople(hass: HomeAssistant, options: PeopleOptions, open: (entityId: string) => void, current?: string | null) {
  const people = visibleOf(hass, options, 'person')
  const alarm = visibleOf(hass, options, 'alarm_control_panel')[0]
  if (!people.length && !alarm) return nothing
  return html`<div class="people">
    ${people.map(p => {
      const home = p.state === 'home'
      const picture = p.attributes.entity_picture as string | undefined
      const name = entityName(p)
      const where = home ? t(hass, 'home_state') : p.state === 'not_home' ? t(hass, 'away') : hass.formatEntityState?.(p) ?? p.state
      return html`<button class="person ${home ? '' : 'away'}" title="${name}: ${where}" aria-label="${name}: ${where}"
        aria-expanded=${current === `person:${p.entity_id}`}
        style=${picture ? `background-image:url('${picture}')` : ''} @click=${() => open(p.entity_id)}>
        ${picture ? nothing : name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
      </button>`
    })}
    ${alarm ? html`<button class="alarm ${alarmColor(alarm.state)}" @click=${() => open(alarm.entity_id)}>
      <ha-icon icon=${ALARM_ICONS[alarm.state] ?? 'mdi:shield-lock'}></ha-icon>${hass.formatEntityState?.(alarm) ?? alarm.state}
    </button>` : nothing}
  </div>`
}

export const peopleStyles = css`
  .people { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
  .person {
    all: unset; position: relative; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; flex: 0 0 auto;
    display: grid; place-items: center; font-size: var(--ad-fs-s); font-weight: 600;
    background: center / cover var(--ad-surface-variant);
  }
  .person.away { filter: grayscale(1); opacity: 0.55; }
  .person::after {
    content: ''; position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%;
    background: rgb(var(--ad-success)); box-shadow: 0 0 0 2px var(--ad-bg);
  }
  .person.away::after { background: rgba(var(--ad-on-surface), 0.4); }
  /* Their devices are open beneath */
  .person[aria-expanded=true] { box-shadow: 0 0 0 2px var(--ad-bg), 0 0 0 4px rgb(var(--ad-primary)); }
  .person:focus-visible, .alarm:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
  .alarm {
    all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px 4px 8px; margin-left: 4px; cursor: pointer;
    border-radius: 999px; font-size: var(--ad-fs-s); white-space: nowrap; background: rgba(var(--ad-on-surface), 0.08);
  }
  .alarm ha-icon { --mdc-icon-size: 16px; }
  .alarm.success ha-icon { color: rgb(var(--ad-success)); }
  .alarm.info { background: rgba(var(--ad-info), 0.16); }
  .alarm.info ha-icon { color: rgb(var(--ad-info)); }
  .alarm.error { background: rgb(var(--ad-error)); color: #fff; animation: alarm 1s ease-in-out infinite; }
  @keyframes alarm { 50% { opacity: 0.55; } }
  @media (prefers-reduced-motion: reduce) { .alarm.error { animation: none; } }
`
