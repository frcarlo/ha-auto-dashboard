import { describe, expect, it } from 'vitest'
import { generateDashboard } from '../src/strategy'
import { browseToItem, findMusicPlayers, formatTime, groupMembers, itemSub, mediaPosition, playsItem } from '../src/music'
import { createHass } from '../dev/mock'

const musicCard = async (config: Record<string, unknown> = {}, hass = createHass(true)) => {
  const { views } = await generateDashboard({ type: 'custom:auto-dashboard', ...config }, hass)
  const page = views.find(v => v.path === 'music')
  const nav = (views[0]!.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).find(c => c.type === 'custom:ad-nav-bar')!
  return {
    page,
    card: page && (page.sections as { cards: Record<string, any>[] }[]).flatMap(s => s.cards).find(c => c.type === 'custom:ad-music'),
    nav: nav.items.map((i: { path: string }) => i.path),
  }
}

describe('music page', () => {
  it('gets its own page in the nav with Music Assistant speakers and Spotify accounts', async () => {
    const { page, card, nav } = await musicCard()
    expect(nav).toContain('music')
    expect(page!.subview).toBe(true)
    expect(card!.players.map((p: { entity: string }) => p.entity)).toEqual([
      'media_player.ma_buro', 'media_player.ma_kuche', 'media_player.ma_schlafzimmer', 'media_player.ma_wohnzimmer', 'media_player.spotify_frank',
    ])
  })

  it('hide_pages, hide_domains media_player or no Music Assistant drop the page', async () => {
    const hass = createHass(true)
    expect((await musicCard({ users: { [hass.user!.id]: { hide_pages: ['music'] } } }, hass)).nav).not.toContain('music')
    expect((await musicCard({ hide_domains: ['media_player'] })).page).toBeUndefined()
    const without = createHass(true)
    for (const id of Object.keys(without.states)) if (without.entities[id]?.platform === 'music_assistant') delete without.states[id]
    expect((await musicCard({}, without)).page).toBeUndefined()
  })
})

describe('music helpers', () => {
  it('puts the room in front of speakers with the same name', () => {
    const names = findMusicPlayers(createHass(true)).map(p => p.name)
    expect(names).toContain('Küche Lautsprecher')
    expect(names).toContain('Wohnzimmer Lautsprecher')
    expect(names).toContain('Nest Mini')
  })

  it('splits the artist off a browsed track and marks lists as openable', () => {
    expect(browseToItem({ title: 'Lucio Dalla - Caruso', media_content_id: 'library://track/1', media_class: 'track' }))
      .toMatchObject({ name: 'Caruso', artists: [{ name: 'Lucio Dalla' }], media_type: 'track' })
    expect(browseToItem({ title: 'Mezzanine', media_content_id: 'library://album/1', media_class: 'album' }).expand).toBe(true)
    expect(itemSub({ uri: 'x', name: 'x', media_type: 'track', album: { name: 'Blue' } })).toBe('Blue')
  })

  it('runs the position on while playing and stops at the end', () => {
    const at = '2026-11-08T12:00:00Z'
    const entity = { entity_id: 'media_player.a', state: 'playing', attributes: { media_position: 10, media_position_updated_at: at, media_duration: 60 } }
    expect(mediaPosition(entity, Date.parse(at) + 5000)).toBe(15)
    expect(mediaPosition(entity, Date.parse(at) + 600_000)).toBe(60)
    expect(mediaPosition({ ...entity, state: 'paused' }, Date.parse(at) + 5000)).toBe(10)
    expect(formatTime(75)).toBe('1:15')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('knows what a player plays and whom it is grouped with', () => {
    const e = { entity_id: 'media_player.a', state: 'playing', attributes: { media_content_id: 'library://radio/1', media_title: 'FluxFM', group_members: ['media_player.a', 'media_player.b'] } }
    expect(playsItem(e, { uri: 'library://radio/1', name: 'x', media_type: 'radio' })).toBe(true)
    expect(playsItem(e, { uri: 'tunein://radio/9', name: 'FluxFM', media_type: 'radio' })).toBe(true)
    expect(playsItem({ ...e, state: 'idle' }, { uri: 'library://radio/1', name: 'x', media_type: 'radio' })).toBe(false)
    expect(groupMembers(e)).toEqual(['media_player.b'])
  })
})
