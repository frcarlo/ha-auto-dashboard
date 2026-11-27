import { describe, expect, it } from 'vitest'
import { cardReady, moreInfoFor, ruleOf, withEntity, type MoreInfoSettings } from '../src/more-info'

const players = [{ entity: 'media_player.buero', name: 'Büro', ma: true }]

describe('more_info rules', () => {
  it('opens the player for a music speaker without any rule', () => {
    expect(moreInfoFor({ players }, 'media_player.buero')).toEqual({ kind: 'player' })
  })

  it('leaves other speakers and other types to HA without a rule', () => {
    expect(moreInfoFor({ players }, 'media_player.tv')).toBeUndefined()
    expect(moreInfoFor({ players }, 'light.kitchen')).toBeUndefined()
    expect(moreInfoFor(undefined, 'media_player.buero')).toBeUndefined()
  })

  it('false keeps HA\'s dialog, also for music speakers', () => {
    expect(moreInfoFor({ players, rules: { media_player: false } }, 'media_player.buero')).toBeUndefined()
  })

  it('a card for a device type gets the tapped entity', () => {
    const s: MoreInfoSettings = { players, rules: { light: { type: 'custom:mushroom-light-card', show_brightness_control: true } } }
    expect(moreInfoFor(s, 'light.kitchen')).toEqual({
      kind: 'card', card: { type: 'custom:mushroom-light-card', show_brightness_control: true, entity: 'light.kitchen' },
    })
  })

  it('an entity\'s own rule beats its type\'s, false included', () => {
    const rules = { media_player: { type: 'custom:mini-media-player' }, 'media_player.buero': 'player' as const, 'media_player.tv': false as const }
    expect(ruleOf(rules, 'media_player.buero')).toBe('player')
    expect(moreInfoFor({ players, rules }, 'media_player.buero')).toEqual({ kind: 'player' })
    expect(moreInfoFor({ players, rules }, 'media_player.tv')).toBeUndefined()
    expect(moreInfoFor({ players, rules }, 'media_player.kueche')).toEqual({ kind: 'card', card: { type: 'custom:mini-media-player', entity: 'media_player.kueche' } })
  })

  it('the player is for speakers only', () => {
    expect(moreInfoFor({ players, rules: { light: 'player' } }, 'light.kitchen')).toBeUndefined()
    expect(moreInfoFor({ players, rules: { media_player: 'player' } }, 'media_player.tv')).toEqual({ kind: 'player' })
  })

  it('ignores a card without a type', () => {
    expect(moreInfoFor({ players: [], rules: { light: { type: ' ' } } }, 'light.kitchen')).toBeUndefined()
  })

  it('keeps an entity or entities the card names itself', () => {
    expect(withEntity({ type: 'entities', entities: ['light.a'] }, 'light.b')).toEqual({ type: 'entities', entities: ['light.a'] })
    expect(withEntity({ type: 'tile', entity: 'light.a' }, 'light.b')).toEqual({ type: 'tile', entity: 'light.a' })
  })

  it('a custom card has to be loaded, HA\'s own cards always can', () => {
    const defined = (name: string) => name === 'mushroom-light-card'
    expect(cardReady('custom:mushroom-light-card', defined)).toBe(true)
    expect(cardReady('custom:mini-media-player', defined)).toBe(false)
    expect(cardReady('tile', defined)).toBe(true)
  })
})
