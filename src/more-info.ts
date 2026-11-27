// What a tap opens in place of HA's own dialog. Under `more_info:` a device type (light, media_player) or a single
// entity gets a card of its own, e.g. a custom card from HACS; `false` keeps HA's dialog. Speakers that play music
// open the dashboard's own player unless a rule says otherwise. A card that is not installed (anymore) leaves HA's
// dialog in place, so a rule never makes a tap do nothing.
import { domainOf } from './presentation'

/** A card as in a dashboard's YAML; the tapped entity is filled in when it names none */
export type MoreInfoCard = { type: string } & Record<string, unknown>

/** `player`: the dashboard's own player (speakers only); `false`: HA's dialog */
export type MoreInfoRule = MoreInfoCard | 'player' | false

export type MoreInfoRules = Record<string, MoreInfoRule>

export type MoreInfoTarget = { kind: 'player' } | { kind: 'card'; card: MoreInfoCard }

/** What the bar carries to the window: the rules and the speakers the player knows */
export interface MoreInfoSettings {
  rules?: MoreInfoRules
  /** The music players, as on the music page */
  players: import('./music').MusicPlayer[]
}

const isCard = (rule: unknown): rule is MoreInfoCard =>
  !!rule && typeof rule === 'object' && !Array.isArray(rule) && typeof (rule as MoreInfoCard).type === 'string' && !!(rule as MoreInfoCard).type.trim()

/** The rule for an entity: its own beats its type's */
export function ruleOf(rules: MoreInfoRules | undefined, entityId: string): MoreInfoRule | undefined {
  if (!rules) return undefined
  return Object.prototype.hasOwnProperty.call(rules, entityId) ? rules[entityId] : rules[domainOf(entityId)]
}

/** The card with the tapped entity, unless it names its own */
export function withEntity(card: MoreInfoCard, entityId: string): MoreInfoCard {
  return 'entity' in card || 'entities' in card ? card : { ...card, entity: entityId }
}

/** What opens for the entity, or nothing for HA's own dialog */
export function moreInfoFor(settings: MoreInfoSettings | undefined, entityId: string): MoreInfoTarget | undefined {
  if (!settings) return undefined
  const rule = ruleOf(settings.rules, entityId)
  if (rule === false) return undefined
  if (isCard(rule)) return { kind: 'card', card: withEntity(rule, entityId) }
  const speaker = domainOf(entityId) === 'media_player'
  if (rule === 'player') return speaker ? { kind: 'player' } : undefined
  return speaker && settings.players.some(p => p.entity === entityId) ? { kind: 'player' } : undefined
}

/**
 * Whether the card can be shown: a custom card must be loaded (installed and in the resources); HA's own cards
 * (tile, media-control) load when they are first made, so they always can.
 */
export function cardReady(type: string, defined: (name: string) => boolean = name => !!customElements.get(name)) {
  return !type.startsWith('custom:') || defined(type.slice(7))
}

/** Cards that have registered with HA's card picker (window.customCards), for the editor */
export function installedCards(): { type: string; name: string }[] {
  const list = (window as unknown as { customCards?: { type?: string; name?: string }[] }).customCards ?? []
  const seen = new Set<string>()
  return list
    .filter(c => typeof c.type === 'string' && c.type && !c.type.startsWith('ad-') && !seen.has(c.type) && !!seen.add(c.type))
    .map(c => ({ type: `custom:${c.type!}`, name: c.name?.trim() || c.type! }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
