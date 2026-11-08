// The music page: which players it offers, and the small helpers for Music Assistant's media items.
// Everything goes through Home Assistant: the Music Assistant integration's services for the library,
// search and playback, media_player for control and grouping. No server of our own, as HArmony has.
import { allEntities, entityAreaId, type Hide } from './model'
import { domainOf, entityName } from './presentation'
import type { HassEntity, HomeAssistant } from './types'

export interface MusicPlayer {
  entity: string
  name: string
  area?: string
  /** A Music Assistant player: it plays from the library and can be grouped */
  ma?: boolean
  /** A Spotify account (Spotify integration): controls only */
  spotify?: boolean
}

/** A Music Assistant media item, as its services return them, or a browse node turned into one */
export interface MediaItem {
  uri: string
  name: string
  media_type: string
  image?: string | null
  artists?: { name: string }[]
  album?: { name: string } | null
  favorite?: boolean
  duration?: number
  /** Can be opened (album, playlist, artist); otherwise only played */
  expand?: boolean
  /** The content type to browse it with, as the media browser gave it */
  browse_type?: string
}

/** A Spotify account as HA's Spotify integration offers it through a Sonos or Cast speaker's media browser */
export interface SpotifyAccount {
  /** The account's root in the browser: spotify://<config entry id> */
  id: string
  name: string
}

/** The parts of a Spotify library shown on Home, in HArmony's order: recently played first */
export const SPOTIFY_SECTIONS = [
  'current_user_recently_played', 'current_user_playlists', 'current_user_followed_artists', 'current_user_saved_albums',
  'current_user_saved_tracks', 'current_user_top_artists', 'current_user_top_tracks',
] as const
export type SpotifySection = (typeof SPOTIFY_SECTIONS)[number]

/** Players whose media browser lists the Spotify accounts, whether or not anything plays on them */
export const SPOTIFY_BROWSER_PLATFORMS = ['sonos', 'cast']

/** Speakers that can browse Spotify, reachable ones of the preferred platform first */
export function findSpotifyBrowsers(hass: HomeAssistant): string[] {
  return Object.values(hass.entities)
    .filter(e => domainOf(e.entity_id) === 'media_player' && SPOTIFY_BROWSER_PLATFORMS.includes(e.platform ?? '') && hass.states[e.entity_id])
    .sort((a, b) => SPOTIFY_BROWSER_PLATFORMS.indexOf(a.platform!) - SPOTIFY_BROWSER_PLATFORMS.indexOf(b.platform!))
    .map(e => e.entity_id)
}

export const isSpotifyItem = (item: MediaItem) => item.uri.startsWith('spotify://')

/** What Music Assistant plays: spotify://<entry>/spotify:playlist:… becomes spotify:playlist:… */
export function playableUri(item: MediaItem): string {
  return /^spotify:\/\/[^/]+\/(spotify:.+)$/.exec(item.uri)?.[1] ?? item.uri
}

export const isMusicAssistant = (hass: HomeAssistant, entity: HassEntity) =>
  hass.entities[entity.entity_id]?.platform === 'music_assistant' || entity.attributes.mass_player_type !== undefined

const isSpotify = (hass: HomeAssistant, entity: HassEntity) => hass.entities[entity.entity_id]?.platform === 'spotify'

/**
 * Music Assistant's players and the Spotify accounts, by name. Other media players (TVs, the cast and Sonos
 * entities Music Assistant already wraps) stay on their room pages. Players with the same name ("Lautsprecher")
 * get their room in front, so they can be told apart.
 */
export function findMusicPlayers(hass: HomeAssistant, hide: Hide = {}): MusicPlayer[] {
  const players = allEntities(hass, hide)
    .filter(e => domainOf(e.entity_id) === 'media_player' && (isMusicAssistant(hass, e) || isSpotify(hass, e)))
    .map((e): MusicPlayer => {
      const area = hass.areas[entityAreaId(hass, e.entity_id) ?? '']?.name
      return {
        entity: e.entity_id, name: entityName(e).trim(), ...(area ? { area } : {}),
        ...(isMusicAssistant(hass, e) ? { ma: true } : { spotify: true }),
      }
    })
  const count = new Map<string, number>()
  for (const p of players) count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1)
  return players
    .map(p => (count.get(p.name.toLowerCase())! > 1 && p.area && !p.name.toLowerCase().includes(p.area.toLowerCase())
      ? { ...p, name: `${p.area} ${p.name}` } : p))
    .sort((a, b) => Number(!!a.spotify) - Number(!!b.spotify) || a.name.localeCompare(b.name))
}

const EXPANDABLE = ['album', 'playlist', 'artist', 'podcast', 'audiobook', 'folder']

/**
 * A child of media_player/browse_media as a media item. Music Assistant names tracks "Artist - Title"
 * when browsing a playlist, so the artist is split off again.
 */
export function browseToItem(node: { title: string; media_content_id: string; media_class?: string; media_content_type?: string; thumbnail?: string | null; can_expand?: boolean }): MediaItem {
  const type = node.media_class === 'directory' ? 'folder' : node.media_class ?? node.media_content_type ?? 'track'
  let name = node.title
  let artists: { name: string }[] | undefined
  // Music Assistant writes "Artist - Title"; Spotify's own titles stay whole
  const split = type === 'track' && !node.media_content_id.startsWith('spotify://') ? / - /.exec(name) : null
  if (split) {
    artists = [{ name: name.slice(0, split.index) }]
    name = name.slice(split.index + 3)
  }
  return {
    uri: node.media_content_id, name, media_type: type, image: node.thumbnail ?? null,
    ...(artists ? { artists } : {}), ...(node.can_expand || EXPANDABLE.includes(type) ? { expand: true } : {}),
    ...(node.media_content_type ? { browse_type: node.media_content_type } : {}),
  }
}

export const canOpenItem = (item: MediaItem) => item.expand ?? EXPANDABLE.includes(item.media_type)

/** The line under a title: the artists, else the album */
export function itemSub(item: MediaItem): string {
  const artists = (item.artists ?? []).map(a => a.name).filter(Boolean).join(', ')
  return artists || item.album?.name || ''
}

/** 3:07, or 1:02:07 past an hour */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

/** Where the player is in the track now: HA only reports the position when it changes, so a playing one runs on */
export function mediaPosition(entity: HassEntity | undefined, now = Date.now()): number {
  const a = entity?.attributes
  if (!a || a.media_position === undefined) return 0
  let position = Number(a.media_position) || 0
  if (entity!.state === 'playing' && a.media_position_updated_at) {
    position += Math.max(0, (now - Date.parse(a.media_position_updated_at)) / 1000)
  }
  const duration = Number(a.media_duration) || 0
  return duration ? Math.min(position, duration) : position
}

/** The picture of what a player plays: HA's proxy first, Music Assistant's own address may not be reachable */
export const playerPicture = (entity: HassEntity | undefined): string | undefined =>
  (entity?.attributes.entity_picture_local ?? entity?.attributes.entity_picture) as string | undefined

/** Whether a player plays this item right now (a station, a track, a playlist it was started from) */
export const playsItem = (entity: HassEntity | undefined, item: MediaItem) =>
  !!entity && ['playing', 'paused', 'buffering'].includes(entity.state) &&
  (entity.attributes.media_content_id === item.uri || entity.attributes.media_content_id === playableUri(item) ||
    (item.media_type === 'radio' && entity.attributes.media_title === item.name))

/** Players grouped with this one, without itself */
export const groupMembers = (entity: HassEntity | undefined): string[] =>
  ((entity?.attributes.group_members ?? []) as string[]).filter(id => id !== entity?.entity_id)
