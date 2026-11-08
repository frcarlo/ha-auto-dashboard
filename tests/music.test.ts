import { describe, expect, it } from 'vitest'
import { generateDashboard } from '../src/strategy'
import { browseToItem, cleanTitle, currentLine, fetchLyrics, findMusicPlayers, parseLrc, findSpotifyBrowsers, formatTime, groupMembers, itemSub, mediaPosition, playableUri, playsItem } from '../src/music'
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

  it('leaves out the dashboard entity Music Assistant adds for Cast displays, but keeps unavailable players', () => {
    const ids = findMusicPlayers(createHass(true)).map(p => p.entity)
    expect(ids).not.toContain('media_player.ma_nest_hub_dashboard')
    expect(ids).toContain('media_player.ma_buro')
    const hass = createHass(true)
    hass.states['media_player.ma_buro'] = { ...hass.states['media_player.ma_buro']!, attributes: { friendly_name: 'Büro Sonos', supported_features: 8320575 } }
    expect(findMusicPlayers(hass).map(p => p.entity)).toContain('media_player.ma_buro')
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

  it('plays Spotify items by their own address and browses them through a Sonos or Cast speaker', () => {
    const playlist = browseToItem({
      title: 'Italo Disco', media_content_id: 'spotify://01abc/spotify:playlist:73nW', media_class: 'playlist', media_content_type: 'spotify://playlist', can_expand: true,
    })
    expect(playableUri(playlist)).toBe('spotify:playlist:73nW')
    expect(playlist.browse_type).toBe('spotify://playlist')
    // Spotify's titles keep their dashes, Music Assistant's "Artist - Title" is split
    expect(browseToItem({ title: 'Jay-Z - Remix', media_content_id: 'spotify://01abc/spotify:track:1', media_class: 'track' }).name).toBe('Jay-Z - Remix')
    expect(playableUri({ uri: 'library://track/1', name: 'x', media_type: 'track' })).toBe('library://track/1')
    expect(findSpotifyBrowsers(createHass(true))).toEqual(['media_player.wohnzimmer_sonos_raw'])
  })

  it('passes the speakers that list Spotify accounts to the card', async () => {
    expect((await musicCard()).card!.spotify_browsers).toEqual(['media_player.wohnzimmer_sonos_raw'])
  })
})

describe('lyrics', () => {
  it('reads LRC with several stamps on a line and skips empty lines', () => {
    const lines = parseLrc('[ar: Someone]\n[00:12.50]Second\n[00:03.00][01:00.0]First and again\n[00:20.00]\n')
    expect(lines).toEqual([
      { time: 3, text: 'First and again' }, { time: 12.5, text: 'Second' }, { time: 60, text: 'First and again' },
    ])
  })

  it('finds the line sung at a position', () => {
    const lines = parseLrc('[00:05.00]a\n[00:10.00]b\n[00:15.00]c')
    expect(currentLine(lines, 2)).toBe(-1)
    expect(currentLine(lines, 5)).toBe(0)
    expect(currentLine(lines, 12)).toBe(1)
    expect(currentLine(lines, 99)).toBe(2)
  })

  it('cleans titles for the search', () => {
    expect(cleanTitle('Bohemian Rhapsody - Remastered 2011')).toBe('Bohemian Rhapsody')
    expect(cleanTitle('Lose Control (feat. Someone)')).toBe('Lose Control')
    expect(cleanTitle('Song 2')).toBe('Song 2')
  })

  it('asks LRCLIB for the track, then searches, and keeps the answer', async () => {
    const calls: string[] = []
    const get = (async (url: string) => {
      calls.push(url)
      if (url.includes('/get?')) return { ok: false, json: async () => null }
      return { ok: true, json: async () => [
        { duration: 400, plainLyrics: 'far off' },
        { duration: 241, syncedLyrics: '[00:01.00]right one' },
      ] }
    }) as unknown as typeof fetch
    const lyrics = await fetchLyrics('Testsong - Remastered 2011', 'Band A & Band B', 'Album', 240, get)
    expect(lyrics).toEqual({ synced: [{ time: 1, text: 'right one' }] })
    expect(calls[0]).toContain('track_name=Testsong+-+Remastered+2011')
    expect(calls[0]).toContain('duration=240')
    expect(calls[1]).toContain('track_name=Testsong&artist_name=Band+A')
    await fetchLyrics('Testsong - Remastered 2011', 'Band A & Band B', 'Album', 240, get)
    expect(calls).toHaveLength(2)
  })

  it('says none when LRCLIB has nothing', async () => {
    const get = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch
    expect(await fetchLyrics('Unknown', 'Nobody', undefined, undefined, get)).toBeNull()
  })
})
