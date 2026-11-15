import { describe, expect, it } from 'vitest'
import { canGroup, maImageUrl, maSlug, type MaPlayer, type MaQueueItem } from '../src/ma-direct'
import type { HassEntity, HomeAssistant } from '../src/types'

const hass = (panels: HomeAssistant['panels']) => ({ panels }) as HomeAssistant

describe('maSlug', () => {
  it('finds the Music Assistant add-on among the sidebar panels', () => {
    // As HA 2026.11 lists add-on panels
    expect(maSlug(hass({
      lovelace: { url_path: 'lovelace', config: null },
      a0d7b954_vscode: { url_path: 'a0d7b954_vscode', config: { addon: 'a0d7b954_vscode' } },
      d5369777_music_assistant: { url_path: 'd5369777_music_assistant', config: { addon: 'd5369777_music_assistant' } },
    }))).toBe('d5369777_music_assistant')
  })

  it('also reads the panels of older HA', () => {
    expect(maSlug(hass({
      lovelace: { url_path: 'lovelace', config: null },
      a0d7b954_vscode: { url_path: 'a0d7b954_vscode', config: { ingress: 'a0d7b954_vscode' } },
      d5369777_music_assistant_beta: { url_path: 'd5369777_music_assistant_beta', config: { ingress: 'd5369777_music_assistant_beta' } },
    }))).toBe('d5369777_music_assistant_beta')
  })

  it('has none without the add-on, or when the user may not open its panel', () => {
    expect(maSlug(hass({ lovelace: { url_path: 'lovelace' } }))).toBeUndefined()
    expect(maSlug(hass(undefined))).toBeUndefined()
  })
})

describe('maImageUrl', () => {
  const base = '/api/hassio_ingress/abc/'
  const item = (patch: Partial<MaQueueItem>): MaQueueItem => ({ queue_item_id: 'q1', name: 'Song', ...patch })

  it("takes the add-on's resized copy first", () => {
    expect(maImageUrl(base, item({ image: { type: 'thumb', path: 'https://i.scdn.co/x', remotely_accessible: true, proxy_id: 'f00' } })))
      .toBe('/api/hassio_ingress/abc/imageproxy/f00?size=160')
  })

  it('takes a picture any browser may load, else the album cover', () => {
    expect(maImageUrl(base, item({ image: { path: 'https://i.scdn.co/x', remotely_accessible: true } }))).toBe('https://i.scdn.co/x')
    expect(maImageUrl(base, item({
      image: { path: '/music/cover.jpg', provider: 'filesystem', remotely_accessible: false },
      media_item: { album: { image: { path: 'https://cover/album.jpg', remotely_accessible: true } } },
    }))).toBe('https://cover/album.jpg')
  })

  it('has none when only the server itself can read the picture', () => {
    expect(maImageUrl(base, item({ image: { path: '/music/cover.jpg', provider: 'filesystem', remotely_accessible: false } }))).toBeUndefined()
  })
})

describe('canGroup', () => {
  const speaker = (entity_id: string, friendly_name: string, active_queue: string): HassEntity =>
    ({ entity_id, state: 'idle', attributes: { friendly_name, active_queue } })
  const kitchen = speaker('media_player.kuche', 'Küche', 'RINCON_1')
  const office = speaker('media_player.buro', 'Büro', 'RINCON_2')
  const hub = speaker('media_player.nest_hub_2', 'Nest Hub', 'fe30')
  const players: MaPlayer[] = [
    { player_id: 'RINCON_1', provider: 'sonos--a', name: 'Küche', can_group_with: ['sonos--a'] },
    { player_id: 'RINCON_2', provider: 'sonos--a', name: 'Büro', can_group_with: ['sonos--a'] },
    { player_id: 'fe30', provider: 'chromecast--b', name: 'Nest Hub', can_group_with: ['c0ff'] },
  ]

  it('lets speakers of one kind play together, by provider or by player', () => {
    expect(canGroup(kitchen, office, players)).toBe(true)
    expect(canGroup(hub, speaker('media_player.mini', 'Mini', 'c0ff'), [...players, { player_id: 'c0ff', provider: 'chromecast--b', name: 'Mini' }])).toBe(true)
  })

  it('keeps Sonos and Cast apart', () => {
    expect(canGroup(kitchen, hub, players)).toBe(false)
    expect(canGroup(hub, kitchen, players)).toBe(false)
  })

  it('finds a renamed speaker by the queue it plays, and lets one it can\'t find through', () => {
    expect(canGroup(speaker('media_player.kuche', 'Küchenradio', 'RINCON_1'), hub, players)).toBe(false)
    expect(canGroup(kitchen, speaker('media_player.neu', 'Neu', 'x'), players)).toBe(true)
  })

  it('tells two speakers of the same name apart by their queues', () => {
    const twins: MaPlayer[] = [
      { player_id: 'a', provider: 'sonos--a', name: 'Lautsprecher', can_group_with: ['sonos--a'] },
      { player_id: 'b', provider: 'chromecast--b', name: 'Lautsprecher', can_group_with: [] },
    ]
    expect(canGroup(speaker('media_player.x', 'Lautsprecher', 'a'), speaker('media_player.y', 'Lautsprecher', 'b'), twins)).toBe(false)
  })
})
