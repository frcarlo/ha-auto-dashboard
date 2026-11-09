import { LitElement, type PropertyValues } from 'lit'
import type { CardLook, HassEntity, HomeAssistant } from '../types'
import { domainOf } from '../presentation'
import { canControl, canOpen } from '../access'
import { applyPalette, paletteVars } from '../styles/palette'
import { hasFailed, isWaiting, settle, subscribe, track } from '../pending'

export interface BaseConfig extends CardLook {
  type: string
}

/**
 * Shared plumbing for all cards: theme attributes, re-rendering only when watched
 * entities change, and the small set of HA interactions (more-info, navigate, services).
 */
export abstract class BaseCard<C extends BaseConfig = BaseConfig> extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
  }

  hass?: HomeAssistant
  config?: C

  setConfig(config: C) {
    this.config = config
  }

  getCardSize() {
    return 2
  }

  /** Entity ids whose state changes should trigger a re-render. */
  protected watched(): string[] {
    return []
  }

  private stopPending?: () => void

  connectedCallback() {
    super.connectedCallback()
    // A switch started anywhere (a heading, a room) shows on every card watching that entity
    this.stopPending = subscribe(ids => {
      if (this.config && this.hass && ids.some(id => this.watched().includes(id))) this.requestUpdate()
    })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopPending?.()
  }

  protected shouldUpdate(changed: PropertyValues<this>) {
    if (!this.config || !this.hass) return false
    if (changed.has('hass')) settle(this.hass)
    if (changed.size > 1 || !changed.has('hass')) return true
    const old = changed.get('hass') as HomeAssistant | undefined
    if (!old || old.themes !== this.hass.themes || old.entities !== this.hass.entities || old.language !== this.hass.language) return true
    return this.watched().some(id => old.states[id] !== this.hass!.states[id])
  }

  private paletteKey?: string

  protected willUpdate() {
    const theme = this.config?.theme ?? 'auto'
    const dark = theme === 'dark' || (theme === 'auto' && !!this.hass?.themes?.darkMode)
    this.toggleAttribute('dark', dark)
    this.toggleAttribute('glass', !!this.config?.glass)
    // Inline variables beat the :host defaults in the shadow styles
    const color = this.config?.primary_color
    const key = color ? `${color}|${dark}` : ''
    if (key !== (this.paletteKey ?? '')) {
      this.paletteKey = key
      applyPalette(this, color ? paletteVars(color, dark) : undefined)
    }
  }

  protected state(entityId?: string): HassEntity | undefined {
    return entityId ? this.hass?.states[entityId] : undefined
  }

  /** Whether the viewing user may operate this entity (per-user rules, see access.ts). */
  protected canControl(entityId: string) {
    return canControl(this.config?.access, entityId)
  }

  protected moreInfo(entityId: string) {
    if (!canOpen(this.config?.access, entityId)) return
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }))
  }

  /** Navigate to a view of the current dashboard. */
  protected navigate(viewPath: string) {
    const dashboard = location.pathname.split('/')[1]
    history.pushState(null, '', `/${dashboard}/${viewPath}`)
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }))
  }

  protected call(domain: string, service: string, entityId: string | string[], data: Record<string, unknown> = {}) {
    const ids = [entityId].flat()
    if (!this.hass || ids.some(id => !this.canControl(id))) return
    const result = this.hass.callService(domain, service, data, { entity_id: entityId })
    track(this.hass, domain, service, ids, data, result)
    return result
  }

  /** The entity was switched and HA hasn't reported its new state yet. */
  protected waiting(entityId: string) {
    return isWaiting(entityId)
  }

  /** The last switch of the entity got no answer. */
  protected noAnswer(entityId: string) {
    return hasFailed(entityId)
  }

  protected toggle(entity: HassEntity) {
    const domain = domainOf(entity.entity_id)
    if (domain === 'scene' || domain === 'script') return this.call(domain, 'turn_on', entity.entity_id)
    if (domain === 'button' || domain === 'input_button') return this.call(domain, 'press', entity.entity_id)
    if (domain === 'lock') return this.call('lock', entity.state === 'locked' ? 'unlock' : 'lock', entity.entity_id)
    if (domain === 'cover') return this.call('cover', 'toggle', entity.entity_id)
    if (domain === 'vacuum') return this.call('vacuum', entity.state === 'cleaning' ? 'return_to_base' : 'start', entity.entity_id)
    return this.call(domain, 'toggle', entity.entity_id)
  }

  /** Split a state into a formatted number and unit, falling back to HA's own formatting. */
  protected value(entity: HassEntity | undefined): { value: string; unit: string } {
    if (!entity || !this.hass) return { value: '–', unit: '' }
    const n = Number(entity.state)
    const unit = String(entity.attributes.unit_of_measurement ?? '')
    if (entity.state !== '' && Number.isFinite(n)) {
      const precision = this.hass.entities[entity.entity_id]?.display_precision ?? (Math.abs(n) >= 100 ? 0 : 1)
      const value = new Intl.NumberFormat(this.hass.locale?.language ?? this.hass.language, {
        maximumFractionDigits: precision,
        minimumFractionDigits: Math.min(precision, Number.isInteger(n) ? 0 : precision),
      }).format(n)
      return { value, unit }
    }
    return { value: this.hass.formatEntityState?.(entity) ?? entity.state, unit: '' }
  }

  protected number(n: number | undefined, digits = 1) {
    if (n === undefined || n === null || !Number.isFinite(Number(n))) return '–'
    return new Intl.NumberFormat(this.hass?.locale?.language ?? this.hass?.language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(n))
  }
}

/**
 * Tap, double tap and long press on one element. Double tap delays the single tap
 * by 220 ms, as in HArmony's room card, so only enable it where it is used.
 */
export function gestures(handlers: { tap?: () => void; double?: () => void; hold?: () => void }) {
  let holdTimer: number | undefined
  let tapTimer: number | undefined
  let held = false
  return {
    down: () => {
      held = false
      if (!handlers.hold) return
      holdTimer = window.setTimeout(() => {
        held = true
        handlers.hold!()
      }, 500)
    },
    up: () => window.clearTimeout(holdTimer),
    click: () => {
      if (held) return
      if (!handlers.double) return handlers.tap?.()
      if (tapTimer) {
        window.clearTimeout(tapTimer)
        tapTimer = undefined
        handlers.double()
        return
      }
      tapTimer = window.setTimeout(() => {
        tapTimer = undefined
        handlers.tap?.()
      }, 220)
    },
  }
}
