import { describe, expect, it } from 'vitest'
import { maImageUrl, maSlug, type MaQueueItem } from '../src/ma-direct'
import type { HomeAssistant } from '../src/types'

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
